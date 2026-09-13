import {providers, endpoint, messagesFor, ask} from './api.mjs';
import {checkPage, permissionFailure, originPattern} from './reader.mjs';
const $ = id => document.getElementById(id);
let configs = {}, selected = 'deepseek', page = null, history = [], manual = false, busy = false, controller;
let grantTarget = null;
const status = (text, error=false) => { $('status').textContent=text; $('status').classList.toggle('error',error); };
function options() {
  for (const id of ['provider','activeProvider']) {
    $(id).replaceChildren(...Object.entries(providers).map(([key,p])=>{
      const opt=document.createElement('option');opt.value=key;opt.textContent=p.name+(configs[key]?.key?' · 已配置':'');return opt;
    }));
  }
  $('activeProvider').value=selected;
}
function fill(id) { $('provider').value=id;const c=configs[id]||providers[id];$('base').value=c.base;$('model').value=c.model;$('key').value=c.key||''; }
function clear() { history=[];$('chat').replaceChildren(); }
function message(role,text,label) {
  const el=document.createElement('div');el.className='message '+role;
  const caption=document.createElement('span');caption.className='caption';caption.textContent=label||(role==='user'?'你':'论文阅读助手');
  const body=document.createElement('div');body.textContent=text;el.append(caption,body);
  if(role==='assistant') {const copy=document.createElement('button');copy.textContent='复制回答';copy.onclick=()=>navigator.clipboard.writeText(text).then(()=>status('已复制')).catch(()=>status('复制失败，请手动选择文字复制。',true));el.append(copy);}
  $('chat').append(el);el.scrollIntoView({block:'nearest'});
}
function setPage(next,isManual=false) {
  if(!page || page.url!==next.url || page.text!==next.text || manual!==isManual) clear();
  page=next;manual=isManual;$('pageTitle').textContent=page.title;$('sourceText').value=page.text;
  $('pageMeta').textContent=`${page.text.length.toLocaleString()} 字符${page.truncated?' · 已截断，仅发送前 100,000 字符':''} · ${isManual?'手动材料':page.url}`;
  $('mode').textContent=isManual?'手动模式（读取网页可切回）':'网页模式（发送时刷新）';
}
async function readPage() {
  grantTarget=null;$('grantPage').hidden=true;
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id) throw new Error('找不到当前标签页。');
  checkPage(tab.url);
  let result;
  try {result=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extract.js']});}
  catch(e) {
    if(permissionFailure(e) && tab.url) {
      grantTarget={id:tab.id,origin:originPattern(tab.url)};
      $('grantPage').textContent='授权读取 '+new URL(tab.url).hostname;
      $('grantPage').hidden=false;
      throw new Error('当前网站尚未授权。点击下方按钮，允许读取此网站后重试。');
    }
    throw new Error('网页读取失败：'+(e.message||'未知错误')+'。请刷新网页后重试，或粘贴正文。');
  }
  const data=result[0]?.result;
  if(data?.error) throw new Error(data.error);
  if(!data?.text || data.text.length<40) throw new Error('未读到足够正文。请展开全文后重试，或在“查看正文 / 粘贴文字”中添加材料。');
  setPage(data);return data;
}
$('grantPage').onclick=async()=>{
  if(!grantTarget || busy) return;
  const target=grantTarget;
  try {
    const permission=chrome.permissions.request({origins:[target.origin]});
    lock(true);
    if(!await permission) throw new Error('未授予网站读取权限。可以再次授权，或粘贴正文。');
    const [current]=await chrome.tabs.query({active:true,currentWindow:true});
    if(current?.id!==target.id || !current.url || originPattern(current.url)!==target.origin) throw new Error('当前标签页已改变。请在目标网页点击“读取网页”。');
    await readPage();status('授权成功，已读取正文。现在可以发送问题。');
  } catch(e) {status(e.message,true);} finally {lock(false);}
};
function lock(value) {
  busy=value;
  for(const id of ['send','read','clear','useText','activeProvider','save','forget','provider','base','model','key','sourceText','grantPage']) $(id).disabled=value;
  document.querySelectorAll('[data-prompt]').forEach(e=>e.disabled=value);
  $('stop').hidden=!value;
}
$('settingsToggle').onclick=()=>{$('settings').hidden=!$('settings').hidden;};
$('provider').onchange=()=>fill($('provider').value);
$('activeProvider').onchange=async()=>{selected=$('activeProvider').value;fill(selected);await chrome.storage.local.set({selected});status('已切换服务。');};
$('save').onclick=async()=>{
  try {
    const id=$('provider').value;
    const config={base:$('base').value.trim(),model:$('model').value.trim(),key:$('key').value.trim()};
    const url=endpoint(config.base,id);
    if(!config.model || !config.key) throw new Error('请填写模型 ID 和 API Key。');
    // Request permission directly within the click gesture, before any awaited storage work.
    const allowed=await chrome.permissions.request({origins:[new URL(url).origin+'/*']});
    if(!allowed) throw new Error('未授权连接该 API 地址，配置未保存。');
    configs[id]=config;selected=id;await chrome.storage.local.set({configs,selected});options();fill(id);$('settings').hidden=true;status('已保存，可读取网页并提问。');
  } catch(e) {status(e.message,true);}
};
$('forget').onclick=async()=>{
  const id=$('provider').value;delete configs[id];await chrome.storage.local.set({configs});options();fill(id);status('已删除此服务的本地密钥与配置。');
};
$('read').onclick=async()=>{lock(true);try{await readPage();status('已读取，请检查正文是否包含全文。');}catch(e){page=null;manual=false;$('pageTitle').textContent='读取失败';$('pageMeta').textContent='请重试或粘贴材料';$('sourceText').value='';clear();status(e.message,true);}finally{lock(false);}};
$('useText').onclick=()=>{
  const text=$('sourceText').value.trim();if(text.length<10)return status('请先粘贴需要阅读的文字。',true);
  setPage({title:'手动提供的阅读材料',url:'手动粘贴',text:text.slice(0,100000),totalChars:text.length,truncated:text.length>100000},true);status('已使用这段文字；发送时不会读取其他网页。');
};
$('clear').onclick=()=>{clear();status('已清空对话。');};
$('stop').onclick=()=>controller?.abort();
async function send(question) {
  if(busy || !question.trim()) return;
  const c=configs[selected];
  if(!c?.key || !c.model){$('settings').hidden=false;fill(selected);return status('请先填写并保存当前服务的 API Key 和模型 ID。',true);}
  lock(true);controller=new AbortController();let timer, timedOut=false;
  try {
    status('正在读取材料…');
    if(!manual) await readPage();
    if(controller.signal.aborted) throw new DOMException('Aborted','AbortError');
    if(!page) throw new Error('请先读取网页或提供文字。');
    message('user',question);$('question').value='';status('正在等待 '+providers[selected].name+' 回答…');
    timer=setTimeout(()=>{timedOut=true;controller.abort();},180000);
    const answer=await ask({...c,provider:selected},messagesFor(page,history,question),controller.signal);
    history.push({role:'user',content:question},{role:'assistant',content:answer});history=history.slice(-8);
    message('assistant',answer,providers[selected].name+' · '+c.model);status('完成');
  } catch(e) {
    if(!$('question').value) $('question').value=question;
    status(e.name==='AbortError'?(timedOut?'请求超过 3 分钟，请重试或减少正文。':'已停止。'):e instanceof TypeError?'网络连接失败，请检查网络、Base URL 和 API 域名授权。':e.message,true);
  } finally {clearTimeout(timer);controller=null;lock(false);}
}
$('form').onsubmit=e=>{e.preventDefault();send($('question').value.trim());};
$('question').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.isComposing){e.preventDefault();send($('question').value.trim());}};
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>send(b.dataset.prompt));
try {
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const stored=await chrome.storage.local.get(['configs','selected']);configs=stored.configs||{};selected=providers[stored.selected]?stored.selected:'deepseek';options();fill(selected);if(!configs[selected]?.key)$('settings').hidden=false;else $('pageMeta').textContent='模型已配置。请读取当前论文网页。';
} catch {status('无法读取本地设置，请重新打开扩展。',true);}
