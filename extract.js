(() => {
  if (document.contentType === 'application/pdf' || document.querySelector('embed[type="application/pdf"]')) return {error:'当前页面是 PDF 阅读器，请打开 HTML 全文页面，或复制论文文字后粘贴到正文区域。'};
  const visible = e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && !e.closest('[hidden],[aria-hidden="true"]'); };
  const meta = name => document.querySelector(`meta[name="${name}"]`)?.content || '';
  const candidates = [...document.querySelectorAll('article,main,[role="main"],#main-content,.article-body,.article__body')].filter(visible);
  const root = candidates.sort((a,b)=>(b.innerText?.length||0)-(a.innerText?.length||0))[0] || document.body;
  const lines = [];
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) { lines.push(node.textContent); return; }
    if (node.nodeType !== Node.ELEMENT_NODE || !visible(node) || node.matches('script,style,noscript,nav,header,footer,aside,button,form,input,textarea,select,svg')) return;
    const block = /^(P|DIV|SECTION|ARTICLE|MAIN|H[1-6]|LI|TR|BR|FIGCAPTION|BLOCKQUOTE)$/.test(node.tagName);
    if(block) lines.push('\n');
    for(const child of node.childNodes) walk(child);
    if(block) lines.push('\n');
    if(node.tagName === 'TD' || node.tagName === 'TH') lines.push(' | ');
  };
  walk(root);
  const text = lines.join('').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  return {
    title:meta('citation_title') || document.title,
    url:location.href,
    doi:meta('citation_doi'),
    authors:[...document.querySelectorAll('meta[name="citation_author"]')].map(e=>e.content).slice(0,80),
    headings:[...root.querySelectorAll('h1,h2,h3,h4')].filter(visible).map(e=>e.innerText.trim()).filter(Boolean).slice(0,100),
    text:text.slice(0,100000), totalChars:text.length, truncated:text.length>100000
  };
})();
