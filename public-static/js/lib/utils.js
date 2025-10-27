export function rewriteElementPaths(container, baseUrl) {
  const elements = container.querySelectorAll('a[href], img[src]');
  elements.forEach(el => {
    if (el.hasAttribute('href')) {
      let path = el.getAttribute('href');
      if (path && !path.startsWith('http') && !path.startsWith('#') && !path.startsWith('javascript:')) {
        try {
          el.href = new URL(path, baseUrl).href;
        } catch (e) {
          console.error(`Error rewriting href "${path}":`, e);
        }
      }
    }
    if (el.hasAttribute('src')) {
      let path = el.getAttribute('src');
      if (path && !path.startsWith('http') && !path.startsWith('data:')) {
        try {
          el.src = new URL(path, baseUrl).href;
        } catch (e) {
          console.error(`Error rewriting src "${path}":`, e);
        }
      }
    }
  });
}

export function scopeCss(cssText, scopeSelector) {
  const ruleRegex = /([^{}]*)(?=\{)/g;
  return cssText.replace(ruleRegex, (match, selector) => {
    const trimmedSelector = selector.trim();
    if (trimmedSelector.startsWith('@') || trimmedSelector === '') return selector;
    if (['html', 'body'].includes(trimmedSelector.toLowerCase())) return scopeSelector;

    return trimmedSelector.split(',').map(part => {
      const partTrimmed = part.trim();
      if (partTrimmed.startsWith('.macos-window')) {
        return partTrimmed.replace('.macos-window', scopeSelector);
      }
      return `${scopeSelector} ${partTrimmed}`;
    }).join(', ');
  });
}

export function loadScriptsSequentially(scripts, baseUrl, container) {
  if (scripts.length === 0) return;
  const scriptNode = scripts.shift();
  const newScript = document.createElement('script');

  for (const attr of scriptNode.attributes) {
    newScript.setAttribute(attr.name, attr.value);
  }

  const next = () => loadScriptsSequentially(scripts, baseUrl);

  if (scriptNode.src) {
    const absoluteUrl = new URL(scriptNode.src, baseUrl).href;
    if (document.querySelector(`script[data-src="${absoluteUrl}"]`)) {
      next();
      return;
    }
    newScript.src = absoluteUrl;
    newScript.dataset.src = absoluteUrl;
    newScript.onload = next;
    newScript.onerror = () => {
      console.error(`Failed to load script: ${absoluteUrl}`);
      next();
    };
    document.body.appendChild(newScript);
  } else {
    newScript.textContent = scriptNode.textContent;
    (container || document.body).appendChild(newScript);
    newScript.remove();
    next();
  }
}
