const ALLOWED_HTML_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
]);

const GLOBAL_ATTRIBUTES = new Set(['title']);
const TAG_ATTRIBUTES = {
  a: new Set(['href', 'rel', 'target', 'title']),
};
const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function isAllowedUrl(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  try {
    const baseUrl = typeof window !== 'undefined' && window.location && window.location.origin
      ? window.location.origin
      : 'https://example.invalid';
    const url = new URL(value, baseUrl);

    return ALLOWED_URL_PROTOCOLS.has(url.protocol);
  } catch (e) {
    return false;
  }
}

function isAllowedAttribute(tagName, attrName) {
  return GLOBAL_ATTRIBUTES.has(attrName) ||
    (TAG_ATTRIBUTES[tagName] && TAG_ATTRIBUTES[tagName].has(attrName));
}

function sanitizeElement(element) {
  const tagName = element.tagName.toLowerCase();

  if (!ALLOWED_HTML_TAGS.has(tagName)) {
    element.replaceWith(element.ownerDocument.createTextNode(element.textContent || ''));
    return;
  }

  Array.from(element.attributes).forEach((attr) => {
    const attrName = attr.name.toLowerCase();

    if (!isAllowedAttribute(tagName, attrName)) {
      element.removeAttribute(attr.name);
      return;
    }

    if (attrName === 'href' && !isAllowedUrl(attr.value)) {
      element.removeAttribute(attr.name);
    }
  });

  if (tagName === 'a' && element.hasAttribute('href')) {
    element.setAttribute('rel', 'noopener noreferrer');
  }

  Array.from(element.childNodes).forEach(sanitizeNode);
}

function sanitizeNode(node) {
  if (node.nodeType === 1) {
    sanitizeElement(node);
  } else if (node.nodeType !== 3) {
    node.remove();
  }
}

export function sanitizeHtml(value) {
  if (!value) {
    return '';
  }

  if (typeof DOMParser === 'undefined') {
    return escapeHtml(value);
  }

  const parsed = new DOMParser().parseFromString(String(value), 'text/html');
  Array.from(parsed.body.childNodes).forEach(sanitizeNode);

  return parsed.body.innerHTML;
}

export function stripHtmlTags(value) {
  if (!value) {
    return '';
  }

  if (typeof DOMParser === 'undefined') {
    return String(value).replace(/<[^>]*>/g, '');
  }

  const parsed = new DOMParser().parseFromString(String(value), 'text/html');
  return parsed.body.textContent || '';
}
