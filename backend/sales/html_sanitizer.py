"""Sanitizador de HTML usado em propostas publicas (F7B.3).

Defesa em camadas: a primeira linha contra XSS sao o iframe sandbox sem
`allow-scripts` e o CSP `script-src 'none'` retornado pelo backend. Mas
nem sempre podemos confiar que essas duas mitigacoes vao continuar
funcionando (bug em browser, override de CSP por extensao, etc.). O HTML
das propostas eh enviado pelo time comercial e nao por um cliente — mas
um vetor interno (operator comprometido) tambem e' real.

Politica:
- Allow-list explicita de tags (cobre o que templates de marketing usam).
- Allow-list de atributos por tag (sem `on*`, `srcdoc`, `formaction`).
- Allow-list de schemes em href/src (`http`, `https`, `mailto`, `tel`).
- Inline styles passam por `bleach.css_sanitizer` (CSS allow-list +
  proibicao de `expression()`/`url(javascript:...)`).
- Strip total de `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`,
  `<input>`, `<meta>`, `<link>` (mesmo com http-equiv).
"""
from __future__ import annotations

import bleach
from bleach.css_sanitizer import CSSSanitizer


# Tags que tipicamente aparecem em propostas/landing pages estaticas.
# `script`, `iframe`, `object`, `embed`, `form`, `input`, `meta`, `link`,
# `base` ficam de fora — `bleach` strip-a por padrao.
ALLOWED_TAGS = frozenset({
    'a', 'abbr', 'address', 'article', 'aside', 'b', 'blockquote', 'br',
    'caption', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details',
    'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2',
    'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'html', 'i', 'img', 'ins',
    'kbd', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'q', 's',
    'samp', 'section', 'small', 'span', 'strong', 'sub', 'summary', 'sup',
    'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u',
    'ul', 'var', 'wbr',
    # Estrutura — necessarias pra um arquivo HTML completo abrir no iframe.
    'body', 'head', 'title', 'style',
})

# Atributos permitidos por tag. `on*` handlers, `srcdoc`, `formaction`,
# `target` (em forms/inputs — ja nao temos forms), e atributos custom data-*
# ficam de fora por default.
ALLOWED_ATTRIBUTES = {
    '*': ['class', 'id', 'lang', 'title', 'style', 'role', 'aria-label',
          'aria-hidden', 'aria-labelledby', 'aria-describedby'],
    'a': ['href', 'name', 'target', 'rel', 'download'],
    'img': ['src', 'alt', 'width', 'height', 'loading'],
    'table': ['border', 'cellpadding', 'cellspacing', 'summary'],
    'td': ['colspan', 'rowspan', 'align', 'valign', 'width'],
    'th': ['colspan', 'rowspan', 'align', 'valign', 'scope', 'width'],
    'col': ['span', 'width'],
    'colgroup': ['span'],
    'time': ['datetime'],
    'q': ['cite'],
    'blockquote': ['cite'],
    'del': ['datetime', 'cite'],
    'ins': ['datetime', 'cite'],
}

# Apenas schemes seguros em href/src. `data:` fora — exceto `data:image/...`
# que `bleach` nao distingue por sub-mime, entao bloqueamos todos.
# `javascript:`, `vbscript:`, `file:`, `about:` ficam fora.
ALLOWED_PROTOCOLS = frozenset({'http', 'https', 'mailto', 'tel'})


# CSS allow-list — propriedades cosmeticas tipicas. `behavior`, `expression`,
# `-moz-binding` ficam fora. `bleach` ja bloqueia `url(javascript:...)`.
ALLOWED_CSS_PROPERTIES = frozenset({
    'background', 'background-color', 'background-image', 'background-position',
    'background-repeat', 'background-size', 'border', 'border-bottom',
    'border-color', 'border-left', 'border-radius', 'border-right',
    'border-style', 'border-top', 'border-width', 'box-shadow', 'color',
    'cursor', 'display', 'flex', 'flex-direction', 'flex-wrap',
    'align-items', 'justify-content', 'gap', 'font', 'font-family',
    'font-size', 'font-style', 'font-weight', 'height', 'letter-spacing',
    'line-height', 'list-style', 'margin', 'margin-bottom', 'margin-left',
    'margin-right', 'margin-top', 'max-height', 'max-width', 'min-height',
    'min-width', 'opacity', 'overflow', 'padding', 'padding-bottom',
    'padding-left', 'padding-right', 'padding-top', 'position', 'text-align',
    'text-decoration', 'text-shadow', 'text-transform', 'transform',
    'transition', 'vertical-align', 'visibility', 'white-space', 'width',
    'word-break', 'word-wrap', 'z-index', 'top', 'right', 'bottom', 'left',
    'object-fit', 'object-position', 'grid', 'grid-template-columns',
    'grid-template-rows', 'grid-gap', 'place-items', 'animation',
})

_CSS = CSSSanitizer(allowed_css_properties=ALLOWED_CSS_PROPERTIES)


def sanitize_proposal_html(content: bytes | str) -> str:
    """Sanitiza o HTML de uma proposta antes de servir publicamente.

    Aceita bytes (do FileField.read()) ou str. Retorna sempre str UTF-8.
    Tags fora do allow-list sao removidas (nao escapadas — preserva
    legibilidade do template). Atributos `on*` / `srcdoc` / hrefs com
    scheme inseguro sao zerados.
    """
    if isinstance(content, bytes):
        text = content.decode('utf-8', errors='replace')
    else:
        text = content

    return bleach.clean(
        text,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        css_sanitizer=_CSS,
        strip=True,
        strip_comments=True,
    )
