"""Tests for the presentations module."""
from __future__ import annotations

import uuid

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient

from presentations.models import (
    Presentation,
    PresentationAccessLog,
    PresentationAsset,
    PublicLink,
)

PNG_HEADER = bytes([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x5c, 0x67, 0xe3,
    0x76, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
])


@pytest.fixture
def user(db):
    User = get_user_model()
    return User.objects.create_user(username="alice", email="alice@test.local", password="pw" * 6)


@pytest.fixture
def other_user(db):
    User = get_user_model()
    return User.objects.create_user(username="bob", email="bob@test.local", password="pw" * 6)


@pytest.fixture
def api(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def presentation(user):
    return Presentation.objects.create(owner=user, name="Demo", client_name="Cliente X")


@pytest.mark.django_db
class TestPresentationCRUD:
    def test_list_only_owned(self, api, user, other_user):
        Presentation.objects.create(owner=user, name="Mine")
        Presentation.objects.create(owner=other_user, name="Theirs")
        r = api.get("/api/v1/presentations/presentations/")
        assert r.status_code == 200
        names = [p["name"] for p in r.data["results"]]
        assert names == ["Mine"]

    def test_create_sets_owner(self, api, user):
        r = api.post("/api/v1/presentations/presentations/",
                     {"name": "New one", "client_name": "Client"}, format="json")
        assert r.status_code == 201
        assert Presentation.objects.get(id=r.data["id"]).owner == user

    def test_retrieve_detail_has_canvas(self, api, presentation):
        r = api.get(f"/api/v1/presentations/presentations/{presentation.id}/")
        assert r.status_code == 200
        assert "canvas_json" in r.data

    def test_cannot_read_others_presentation(self, api, other_user):
        theirs = Presentation.objects.create(owner=other_user, name="Theirs")
        r = api.get(f"/api/v1/presentations/presentations/{theirs.id}/")
        assert r.status_code == 404

    def test_duplicate_action(self, api, presentation):
        r = api.post(f"/api/v1/presentations/presentations/{presentation.id}/duplicate/")
        assert r.status_code == 201
        assert r.data["name"].endswith("(cópia)")

    def test_list_includes_totals(self, api, presentation):
        PublicLink.objects.create(presentation=presentation, label="A", total_views=5)
        PublicLink.objects.create(presentation=presentation, label="B", total_views=3, is_active=False)
        r = api.get("/api/v1/presentations/presentations/")
        row = r.data["results"][0]
        assert row["total_views"] == 8
        assert row["total_links"] == 1  # only the active link counts


@pytest.mark.django_db
class TestPublicLinkCRUD:
    def test_create_hashes_password(self, api, presentation):
        r = api.post("/api/v1/presentations/links/", {
            "presentation": str(presentation.id),
            "label": "Client A",
            "password": "mysecret",
        }, format="json")
        assert r.status_code == 201
        assert r.data["password_protected"] is True
        link = PublicLink.objects.get(id=r.data["id"])
        assert link.password_hash and link.password_hash != "mysecret"

    def test_cannot_create_for_others_presentation(self, api, other_user):
        theirs = Presentation.objects.create(owner=other_user, name="Theirs")
        r = api.post("/api/v1/presentations/links/", {
            "presentation": str(theirs.id), "label": "Sneaky",
        }, format="json")
        # fails at queryset validation or permission check
        assert r.status_code in (400, 403, 404)

    def test_revoke_action(self, api, presentation):
        link = PublicLink.objects.create(presentation=presentation, label="Temp")
        r = api.post(f"/api/v1/presentations/links/{link.id}/revoke/")
        assert r.status_code == 200
        link.refresh_from_db()
        assert link.is_active is False
        assert link.revoked_at is not None


@pytest.mark.django_db
class TestPublicEndpoints:
    def _link(self, presentation, password=None, expires_at=None, is_active=True):
        return PublicLink.objects.create(
            presentation=presentation,
            label="x",
            password_hash=make_password(password) if password else "",
            expires_at=expires_at,
            is_active=is_active,
        )

    def test_meta_for_missing_token(self, db):
        c = APIClient()
        r = c.get(f"/api/v1/public-presentations/{uuid.uuid4()}/meta/")
        assert r.status_code == 404

    def test_meta_returns_flag_when_protected(self, db, presentation):
        link = self._link(presentation, password="pw")
        c = APIClient()
        r = c.get(f"/api/v1/public-presentations/{link.token}/meta/")
        assert r.status_code == 200
        assert r.data["password_required"] is True

    def test_meta_404_for_revoked(self, db, presentation):
        link = self._link(presentation, is_active=False)
        c = APIClient()
        r = c.get(f"/api/v1/public-presentations/{link.token}/meta/")
        assert r.status_code == 410
        assert r.data["error"] == "revoked"

    def test_content_increments_views_and_logs_access(self, db, presentation):
        link = self._link(presentation)
        c = APIClient()
        r = c.get(f"/api/v1/public-presentations/{link.token}/content/")
        assert r.status_code == 200
        link.refresh_from_db()
        assert link.total_views == 1
        assert PresentationAccessLog.objects.filter(public_link=link).count() == 1
        assert "session_id" in r.data

    def test_content_blocked_when_password_required(self, db, presentation):
        link = self._link(presentation, password="pw")
        c = APIClient()
        r = c.get(f"/api/v1/public-presentations/{link.token}/content/")
        assert r.status_code == 401
        assert r.data["password_required"] is True

    def test_unlock_wrong_password(self, db, presentation):
        link = self._link(presentation, password="correct")
        c = APIClient()
        r = c.post(f"/api/v1/public-presentations/{link.token}/unlock/",
                   {"password": "wrong"}, format="json")
        assert r.status_code == 401
        assert r.data["error"] == "invalid-password"

    def test_unlock_right_password(self, db, presentation):
        link = self._link(presentation, password="correct")
        c = APIClient()
        r = c.post(f"/api/v1/public-presentations/{link.token}/unlock/",
                   {"password": "correct"}, format="json")
        assert r.status_code == 200
        assert "canvas_json" in r.data

    def test_heartbeat_updates_duration(self, db, presentation):
        link = self._link(presentation)
        c = APIClient()
        c.get(f"/api/v1/public-presentations/{link.token}/content/")
        log = PresentationAccessLog.objects.get(public_link=link)
        r = c.post(f"/api/v1/public-presentations/{link.token}/heartbeat/",
                   {"session_id": log.id, "duration_seconds": 42}, format="json")
        assert r.status_code == 200
        log.refresh_from_db()
        assert log.duration_seconds == 42

    def test_heartbeat_ignores_cross_token(self, db, presentation):
        link_a = self._link(presentation)
        link_b = self._link(presentation)
        c = APIClient()
        c.get(f"/api/v1/public-presentations/{link_a.token}/content/")
        log_a = PresentationAccessLog.objects.get(public_link=link_a)
        # Try to update log_a via link_b's endpoint — should be ignored.
        c.post(f"/api/v1/public-presentations/{link_b.token}/heartbeat/",
               {"session_id": log_a.id, "duration_seconds": 999}, format="json")
        log_a.refresh_from_db()
        assert log_a.duration_seconds == 0


@pytest.mark.django_db
class TestAssetUploadValidation:
    URL = "/api/v1/presentations/assets/"

    def test_rejects_non_image_mime(self, api):
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("evil.exe", b"MZ\x90\x00", content_type="application/x-msdownload")
        r = api.post(self.URL, {"name": "e", "kind": "logo", "file": f}, format="multipart")
        assert r.status_code == 400

    def test_rejects_fake_png(self, api):
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("fake.png", b"this is plain text", content_type="image/png")
        r = api.post(self.URL, {"name": "e", "kind": "logo", "file": f}, format="multipart")
        assert r.status_code == 400

    def test_accepts_real_png(self, api, user):
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("real.png", PNG_HEADER, content_type="image/png")
        r = api.post(self.URL, {"name": "logo", "kind": "logo", "file": f}, format="multipart")
        assert r.status_code == 201
        assert PresentationAsset.objects.filter(owner=user).count() == 1
