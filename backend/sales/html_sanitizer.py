"""Sanitizador de HTML usado em propostas publicas (F7B.3 + F7B.4).

Defesa em camadas: a primeira linha contra XSS sao o iframe sandbox sem
`allow-scripts` e o CSP `script-src 'none'` retornado pelo backend. Mas
nem sempre podemos confiar que essas duas mitigacoes vao continuar
funcionando (bug em browser, override de CSP por extensao, etc.). O HTML
das propostas eh enviado pelo time comercial e nao por um cliente — mas
um vetor interno (operator comprometido) tambem e' real.

Politica:
- Pre-strip de blocos <script>/<noscript>/<style> com expression() ANTES
  do bleach (F7B.4) — evita que conteudo do <script> apareca como texto
  literal apos bleach remover so a tag.
- Allow-list explicita de tags (cobre templates de marketing modernos:
  HTML5 sectioning, SVG inline, <picture>/<source> responsivo).
- Allow-list de atributos por tag, incluindo `data-*` (inertes sem JS,
  seguros — JS ja esta bloqueado em todas as camadas).
- Allow-list de schemes em href/src (`http`, `https`, `mailto`, `tel`).
- Inline styles passam por `bleach.css_sanitizer` (CSS allow-list,
  proibicao de `expression()`/`url(javascript:...)`); CSS variables
  custom (`--prefixed`) sao permitidas.
- Reveal-fix CSS auto-injetado quando o pre-strip remove pelo menos um
  <script> — neutraliza padroes "hide com CSS, mostra com JS" que sem
  o script ficam permanentemente invisiveis.
"""
from __future__ import annotations

import re

import bleach
from bleach.css_sanitizer import CSSSanitizer


# ── Pre-strip patterns (F7B.4) ──────────────────────────────────────────────
# bleach com `strip=True` remove a tag mas mantem o INNER TEXT. Para
# <script>, isso significa que o JS aparece como texto literal na pagina —
# bug catastrofico. Removemos blocos completos antes de chamar bleach.
_SCRIPT_BLOCK_RE = re.compile(
    r'<script\b[^>]*>.*?</script\s*>',
    re.IGNORECASE | re.DOTALL,
)
# <noscript> tambem: nao queremos vazamento de texto que so existia pra
# usuarios sem JS (irrelevante no nosso contexto).
_NOSCRIPT_BLOCK_RE = re.compile(
    r'<noscript\b[^>]*>.*?</noscript\s*>',
    re.IGNORECASE | re.DOTALL,
)
# <script> orfa (sem fechamento) — defesa contra mismatching tags.
_SCRIPT_OPEN_RE = re.compile(
    r'<script\b[^>]*/?>',
    re.IGNORECASE,
)


# ── Tag allow-list ──────────────────────────────────────────────────────────
ALLOWED_TAGS = frozenset({
    # Estrutura HTML5
    'html', 'body', 'head', 'title', 'style',
    # Sectioning (landing page typical)
    'article', 'aside', 'footer', 'header', 'main', 'nav', 'section',
    # Texto
    'a', 'abbr', 'address', 'b', 'blockquote', 'br', 'cite', 'code',
    'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption',
    'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'ins',
    'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'samp', 'small',
    'span', 'strong', 'sub', 'summary', 'sup', 'time', 'u', 'ul',
    'var', 'wbr',
    # Tabelas
    'caption', 'col', 'colgroup', 'table', 'tbody', 'td', 'tfoot', 'th',
    'thead', 'tr',
    # Multimidia inerte (sem autoplay; <video>/<audio> ficam fora)
    'img', 'picture', 'source',
    # SVG inline (icones, ilustracoes) — F7B.4
    # `foreignObject` e `script` (svg) ficam de fora.
    'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
    'ellipse', 'g', 'defs', 'use', 'symbol', 'linearGradient',
    'radialGradient', 'stop', 'text', 'tspan', 'desc',
    # Filtros SVG (efeitos visuais comuns)
    'filter', 'feGaussianBlur', 'feOffset', 'feMerge', 'feMergeNode',
    'feColorMatrix', 'feFlood', 'feComposite', 'feMorphology', 'feBlend',
    'mask', 'clipPath',
})


# ── Atributos por tag ────────────────────────────────────────────────────────
# `*` aplica a todas as tags. `on*` handlers, `srcdoc`, `formaction`,
# `xlink:href` (vetor SVG), `srcset` em img sao tratados explicitamente.
def _attribute_filter(tag, name, value):
    """Allow-list dinamica que aceita data-* e atributos SVG geometricos.

    bleach 6.x permite uma callable como filter — chamada por (tag, attr, val).
    Retornar True permite, False remove o atributo.
    """
    # data-* e' seguro sem JS (que esta bloqueado em todas as camadas).
    if name.startswith('data-'):
        return True
    # aria-* ARIA accessibility — todos seguros, leitura apenas.
    if name.startswith('aria-'):
        return True

    # Attrs comuns a varias tags
    if name in (
        'class', 'id', 'lang', 'title', 'style', 'role', 'dir', 'tabindex',
        'hidden',
    ):
        return True

    # Por tag
    table = {
        'a': {'href', 'name', 'target', 'rel', 'download'},
        'img': {
            'src', 'alt', 'width', 'height', 'loading', 'decoding',
            'fetchpriority', 'srcset', 'sizes',
        },
        'source': {'src', 'srcset', 'sizes', 'media', 'type', 'width', 'height'},
        'picture': set(),
        'table': {'border', 'cellpadding', 'cellspacing', 'summary'},
        'td': {'colspan', 'rowspan', 'align', 'valign', 'width', 'headers'},
        'th': {'colspan', 'rowspan', 'align', 'valign', 'scope', 'width', 'headers'},
        'col': {'span', 'width'},
        'colgroup': {'span'},
        'time': {'datetime'},
        'q': {'cite'},
        'blockquote': {'cite'},
        'del': {'datetime', 'cite'},
        'ins': {'datetime', 'cite'},
        'details': {'open'},
        # SVG geometricos / presentation attrs.
        # `xlink:href` em <use> e' OK pra apontar pra <symbol> definido no doc;
        # bleach normaliza schemes via ALLOWED_PROTOCOLS, entao javascript: em
        # xlink:href e' bloqueado.
        'svg': {
            'viewBox', 'xmlns', 'xmlns:xlink', 'preserveAspectRatio',
            'width', 'height', 'fill', 'stroke', 'stroke-width',
        },
        'path': {
            'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
            'stroke-linejoin', 'fill-rule', 'opacity', 'transform',
            'clip-path', 'mask',
        },
        'circle': {'cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width',
                   'opacity', 'transform'},
        'ellipse': {'cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width',
                    'opacity', 'transform'},
        'rect': {'x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke',
                 'stroke-width', 'opacity', 'transform'},
        'line': {'x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width',
                 'stroke-linecap', 'opacity', 'transform'},
        'polyline': {'points', 'fill', 'stroke', 'stroke-width', 'opacity',
                     'transform'},
        'polygon': {'points', 'fill', 'stroke', 'stroke-width', 'opacity',
                    'transform'},
        'g': {'fill', 'stroke', 'opacity', 'transform', 'clip-path', 'mask',
              'filter'},
        'defs': set(),
        'use': {'href', 'xlink:href', 'x', 'y', 'width', 'height', 'transform'},
        'symbol': {'viewBox', 'preserveAspectRatio'},
        'linearGradient': {'x1', 'y1', 'x2', 'y2', 'gradientUnits',
                           'gradientTransform', 'spreadMethod'},
        'radialGradient': {'cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits',
                           'gradientTransform'},
        'stop': {'offset', 'stop-color', 'stop-opacity'},
        'text': {'x', 'y', 'dx', 'dy', 'text-anchor', 'fill', 'font-family',
                 'font-size', 'font-weight', 'transform'},
        'tspan': {'x', 'y', 'dx', 'dy', 'text-anchor', 'fill'},
        'mask': {'x', 'y', 'width', 'height', 'maskUnits', 'maskContentUnits'},
        'clipPath': {'clipPathUnits'},
        'filter': {'x', 'y', 'width', 'height', 'filterUnits',
                   'primitiveUnits'},
        'feGaussianBlur': {'in', 'stdDeviation', 'result'},
        'feOffset': {'in', 'dx', 'dy', 'result'},
        'feMerge': set(),
        'feMergeNode': {'in'},
        'feColorMatrix': {'in', 'type', 'values', 'result'},
        'feFlood': {'flood-color', 'flood-opacity', 'result'},
        'feComposite': {'in', 'in2', 'operator', 'result', 'k1', 'k2', 'k3', 'k4'},
        'feMorphology': {'in', 'operator', 'radius', 'result'},
        'feBlend': {'in', 'in2', 'mode', 'result'},
    }
    allowed_for_tag = table.get(tag, set())
    return name in allowed_for_tag


# ── Schemes em href/src ──────────────────────────────────────────────────────
ALLOWED_PROTOCOLS = frozenset({'http', 'https', 'mailto', 'tel'})


# ── CSS allow-list (inline `style=` + bloco <style>) ─────────────────────────
# F7B.4: expandido pra cobrir templates modernos (flex/grid avancado, filtros,
# variaveis custom, animacoes). `behavior`, `expression`, `-moz-binding`,
# `url(javascript:)` continuam bloqueados pelo CSSSanitizer/bleach.
ALLOWED_CSS_PROPERTIES = frozenset({
    # Layout box
    'display', 'box-sizing', 'visibility', 'overflow', 'overflow-x',
    'overflow-y', 'overflow-wrap', 'white-space', 'pointer-events',
    'isolation', 'contain',
    # Position
    'position', 'top', 'right', 'bottom', 'left', 'inset', 'z-index',
    # Sizing
    'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
    'aspect-ratio', 'object-fit', 'object-position',
    # Margin / padding
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'margin-block', 'margin-inline',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'padding-block', 'padding-inline',
    # Flex
    'flex', 'flex-direction', 'flex-wrap', 'flex-flow', 'flex-grow',
    'flex-shrink', 'flex-basis', 'order',
    # Grid
    'grid', 'grid-template', 'grid-template-columns', 'grid-template-rows',
    'grid-template-areas', 'grid-area', 'grid-column', 'grid-row',
    'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end',
    'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows', 'grid-gap',
    # Alignment (flex + grid)
    'align-items', 'align-content', 'align-self', 'justify-items',
    'justify-content', 'justify-self', 'place-items', 'place-content',
    'place-self', 'gap', 'row-gap', 'column-gap',
    # Tipografia
    'color', 'font', 'font-family', 'font-size', 'font-style', 'font-weight',
    'font-variant', 'font-stretch', 'line-height', 'letter-spacing',
    'word-spacing', 'text-align', 'text-decoration', 'text-decoration-color',
    'text-decoration-line', 'text-decoration-style', 'text-decoration-thickness',
    'text-shadow', 'text-transform', 'text-overflow', 'text-indent',
    'word-break', 'word-wrap', 'hyphens', 'vertical-align', 'direction',
    'unicode-bidi', 'writing-mode',
    # Background
    'background', 'background-attachment', 'background-blend-mode',
    'background-clip', 'background-color', 'background-image',
    'background-origin', 'background-position', 'background-repeat',
    'background-size',
    # Border / outline
    'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-color', 'border-style', 'border-width', 'border-radius',
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-left-radius', 'border-bottom-right-radius',
    'border-image', 'outline', 'outline-color', 'outline-style',
    'outline-width', 'outline-offset',
    # Effects
    'box-shadow', 'opacity', 'filter', 'backdrop-filter', 'mix-blend-mode',
    'mask', 'mask-image', 'mask-position', 'mask-size', 'mask-repeat',
    'clip-path',
    # Transforms / animations
    'transform', 'transform-origin', 'transform-style', 'perspective',
    'perspective-origin', 'transition', 'transition-property',
    'transition-duration', 'transition-timing-function', 'transition-delay',
    'animation', 'animation-name', 'animation-duration',
    'animation-timing-function', 'animation-delay', 'animation-iteration-count',
    'animation-direction', 'animation-fill-mode', 'animation-play-state',
    'will-change',
    # Listas
    'list-style', 'list-style-type', 'list-style-position',
    'list-style-image',
    # Misc
    'cursor', 'caret-color', 'resize', 'user-select', 'appearance',
    'tab-size', 'scroll-behavior', 'scroll-snap-type', 'scroll-snap-align',
    # Tabelas
    'border-collapse', 'border-spacing', 'caption-side', 'empty-cells',
    'table-layout',
    # Custom variable definitions sao permitidas via _css_property_filter.
})


class _CssAllowList:
    """Allow-list que aceita prefixo `--*` (CSS variables custom).

    bleach.CSSSanitizer 6.x espera um iterable que suporte `in`/contains
    (set/list/etc). Implementamos `__contains__` pra abrir excecao do
    prefixo `--`, mantendo o resto da allow-list explicita.
    """
    def __init__(self, props):
        self._props = frozenset(props)

    def __contains__(self, item):
        if isinstance(item, str) and item.startswith('--'):
            return True
        return item in self._props

    def __iter__(self):
        return iter(self._props)


_CSS = CSSSanitizer(allowed_css_properties=_CssAllowList(ALLOWED_CSS_PROPERTIES))


# ── Reveal-fix CSS (F7B.4) ──────────────────────────────────────────────────
# Templates modernos escondem secoes com CSS e mostram via JS scroll-triggered
# (AOS, GSAP, framer-motion). Sem JS, conteudo fica permanentemente oculto.
# Quando detectamos remocao de <script>, injetamos esse CSS pra neutralizar
# os padroes mais comuns de "hide-then-reveal".
_REVEAL_FIX_CSS = '''
<style data-injected="reveal-fix">
/* F7B.4: garante que conteudo escondido por convencao volte a aparecer
   quando o JS de reveal e' removido pelo sanitizer. */
.hidden, .invisible, .opacity-0,
[data-aos], [data-animation], [data-animate], [data-fade],
[data-reveal], [data-scroll-reveal],
[class*="hidden-until"], [class*="reveal-on"],
[class*="fade-up"], [class*="fade-down"], [class*="fade-in"],
[class*="slide-up"], [class*="slide-down"], [class*="slide-in"] {
    opacity: 1 !important;
    visibility: visible !important;
    transform: none !important;
}
</style>
'''


def sanitize_proposal_html(content: bytes | str) -> str:
    """Sanitiza o HTML de uma proposta antes de servir publicamente.

    Aceita bytes (do FileField.read()) ou str. Retorna sempre str UTF-8.
    Tags fora do allow-list sao removidas. Atributos `on*` / `srcdoc` /
    hrefs com scheme inseguro sao zerados.
    """
    if isinstance(content, bytes):
        text = content.decode('utf-8', errors='replace')
    else:
        text = content

    # F7B.4: pre-strip de blocos completos de <script>/<noscript> antes do
    # bleach. Sem isso, bleach removeria so a tag e o JS apareceria como
    # texto literal na pagina.
    had_script = bool(_SCRIPT_BLOCK_RE.search(text) or _SCRIPT_OPEN_RE.search(text))
    text = _SCRIPT_BLOCK_RE.sub('', text)
    text = _NOSCRIPT_BLOCK_RE.sub('', text)
    text = _SCRIPT_OPEN_RE.sub('', text)

    cleaned = bleach.clean(
        text,
        tags=ALLOWED_TAGS,
        attributes=_attribute_filter,
        protocols=ALLOWED_PROTOCOLS,
        css_sanitizer=_CSS,
        strip=True,
        strip_comments=True,
    )

    # F7B.4: se removemos pelo menos um <script>, injeta CSS reveal-fix
    # antes de </body> (ou no final, se nao houver) pra neutralizar
    # "hide com CSS, mostra com JS".
    if had_script:
        body_close = re.search(r'</body\s*>', cleaned, re.IGNORECASE)
        if body_close:
            insert_pos = body_close.start()
            cleaned = cleaned[:insert_pos] + _REVEAL_FIX_CSS + cleaned[insert_pos:]
        else:
            cleaned = cleaned + _REVEAL_FIX_CSS

    return cleaned
