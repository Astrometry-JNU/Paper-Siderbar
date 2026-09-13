export function checkPage(url) {
  if (!url) return;
  const u = new URL(url);
  if (u.protocol === 'file:' || /\.pdf$/i.test(u.pathname)) throw new Error('当前页面是 PDF 或本地文件。请打开期刊的 HTML / Full text 页面，或粘贴论文文字。');
  if (!['https:', 'http:'].includes(u.protocol) || u.hostname === 'chromewebstore.google.com' || (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore'))) throw new Error('Chrome 不允许扩展读取此类页面。请切换到普通期刊网页，或粘贴正文。');
}
export function permissionFailure(error) {
  return /cannot access|missing host permission|must request permission|not allowed to access|cannot be scripted/i.test(error?.message || '');
}
export function originPattern(url) {
  const u = new URL(url);
  if (!['https:', 'http:'].includes(u.protocol)) throw new Error('只能授权普通 HTTP / HTTPS 网站。');
  return `${u.protocol}//${u.hostname}/*`;
}
