const linkState=Symbol('inLink');
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr = s => s.replace(/&[a-zA-Z][a-zA-Z0-9]*;|[&<>"']/g, c => c.length>1?c:esc(c));
const unesc = s => s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/g, '$1').replace(/&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/gi, (m,n) => {
  if (n[0] !== '#') return m;
  const v = n[1].toLowerCase() === 'x' ? parseInt(n.slice(2),16) : +n.slice(1);
  try { return String.fromCodePoint(v); } catch { return '\uFFFD'; }
});
const cleanUrl = s => { try { return attr(encodeURI(s).replace(/%25/g,'%')); } catch { return esc(s); } };
const href = s => cleanUrl(unesc(s).replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/g,'$1'));

function codeSpan(src) {
  const opener=/^`+/.exec(src);if(!opener)return null;
  const re=/`+/g;re.lastIndex=opener[0].length;let m;
  while((m=re.exec(src)))if(m[0].length===opener[0].length)return [src.slice(0,re.lastIndex),opener[0],src.slice(opener[0].length,m.index)];
  return null;
}

function inline(src, refs, depth=0, textOnly=false, inLink=false, checkLinks=false) {
  inLink ||= !!refs[linkState];
  if (depth > 12) return esc(src);
  let out='', i=0, plain='';
  const nodes=[], delimiters=[];
  const plainRun=/[^\\`<![\*_~&\s(]+/y;
  const masked=[];for(const z of src.matchAll(/``[^`]*`[^`]*?\]\([^)]*\)[^`]*`/g))masked.push([z.index,z.index+z[0].length]);for(const z of src.matchAll(/\[[^\]\n]*``[^`]*`[^`]+``[^\]\n]+\](?:\([^\n]*?\)|\[[^\]]*\])/g))masked.push([z.index,z.index+z[0].length]);for(let k=0;k<src.length;k++){if(src[k]==='`'){const z=codeSpan(src.slice(k));if(z){if(z[1].length===2&&/^``[^`]*`[^`]*?\]\(/.test(z[0]))masked.push([k,k+z[0].length]);k+=z[0].length-1;}}}
  const save=()=>{flush();if(out){nodes.push({html:out});out='';}};
  const punct=c=>/[\p{P}\p{S}]/u.test(c);
  const space=c=>!c||/\s/u.test(c);
  const flush=()=>{ if(plain){out+=esc(plain);plain='';} };
  while(i<src.length) {
    const rest=src.slice(i), ch=src[i], boundary=i===0||/[\s(<]/.test(src[i-1]); let m;
    if (ch==='`' && (m=codeSpan(rest))) { flush(); let t=m[2].replace(/\n/g,' '); if(/^ .* $/.test(t)&&/[^ ]/.test(t)) t=t.slice(1,-1); out+=textOnly?esc(t):'<code>'+esc(t)+'</code>'; i+=m[0].length; continue; }
    if (ch==='\\' && (m=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/.exec(rest))) { flush();out+=esc(m[1]);i+=m[0].length;continue; }
    if ((ch===' '||ch==='\\') && (m=/^ {2,}\n[ \t]*|^\\\n[ \t]*/.exec(rest))) {flush();out+='<br>';i+=m[0].length;continue;}
    if (ch==='<' && !checkLinks && (m=/^<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\x00-\x20<>]*)>/.exec(rest))) {flush();out+='<a href="'+cleanUrl(m[1])+'">'+esc(m[1])+'</a>';i+=m[0].length;continue;}
    if (ch==='<' && !checkLinks && (m=/^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/.exec(rest))) {flush();out+='<a href="'+cleanUrl('mailto:'+m[1])+'">'+esc(m[1])+'</a>';i+=m[0].length;continue;}
    if (ch==='<' && (m=/^<!--(?:-?>|[^]*?-->)|^<![A-Z][^>]*>|^<!\[CDATA\[[^]*?\]\]>|^<\/[A-Za-z][A-Za-z0-9-]*\s*>|^<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:"[^"\x00]*"|'[^'\x00]*'|[^\s"'=<>`]+))?)*\s*\/?>|^<\?[\s\S]*?\?>/.exec(rest))) {flush();if(checkLinks){out+='';i+=m[0].length;continue;}if(/^<a(?:\s|>)/i.test(m[0]))refs[linkState]=inLink=true;else if(/^<\/a\s*>/i.test(m[0]))refs[linkState]=inLink=false;out+=m[0];i+=m[0].length;continue;}
    if(!inLink&&boundary&&delimiters.some(d=>d.ch==='_'&&d.open&&d.len>=1)&&(m=/^(?:mailto:|xmpp:)?[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?=_{1,2}(?!\w))/.exec(rest))){flush();out+='<a href="'+href(m[0].includes(':')?m[0]:'mailto:'+m[0])+'">'+esc(m[0])+'</a>';i+=m[0].length;continue;}
    if (boundary && (m=/^(?:mailto:|xmpp:)?[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+[_-](?![A-Za-z0-9])/.exec(rest))) {plain+=m[0];i+=m[0].length;continue;}
    if (!inLink && boundary && (m=/^([hH][tT][tT][pP][sS]?:\/\/[^\s<>]+|www\.[^\s<>]+|(?:mailto:|xmpp:)?[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?!(?:[\w-]))(?:\/[A-Za-z0-9@._+-]+)?)/.exec(rest)) && boundary) {flush();let v=m[0], prev;for(let k=0;k<v.length;k++)if(v[k]==='('){let end=v.indexOf(')',k+1);if(end<0){v=v.slice(0,k);break;}k=end;}do{prev=v;v=v.replace(/(?:[?!.,:;*_~]+|&[a-zA-Z0-9]+;)$/,'');if(v.endsWith(')')){let balance=0,unmatched=false;for(const c of v){if(c==='(')balance++;else if(c===')'){unmatched=balance===0;if(balance)balance--;}}if(unmatched)v=v.slice(0,-1);}}while(v!==prev);let u=v.startsWith('www.')?'http://'+v:v.includes('@')&&!v.includes(':')?'mailto:'+v:v;out+='<a href="'+href(u)+'">'+esc(v)+'</a>';i+=v.length;continue;}
    if (rest[0]==='[' || (rest[0]==='!'&&rest[1]==='[')) {
      const image=rest[0]==='!', start=image?2:1;let j=start,level=1;
      for(;j<rest.length&&level;j++){if(rest[j]==='\\'){j++;continue;}if(rest[j]==='`'){const z=codeSpan(rest.slice(j));if(z&&!(z[1].length>1&&/\][([]/.test(z[0]))){j+=z[0].length-1;continue;}}
        if(rest[j]==='<'){const z=/^<(?:[^>"']|"[^"]*"|'[^']*')*>/.exec(rest.slice(j));if(z){j+=z[0].length-1;continue;}}
        if(rest[j]==='[')level++;else if(rest[j]===']')level--;}
      if(!level){const label=rest.slice(start,j-1), tail=rest.slice(j);let used=j, target=null,title='';
        if(tail[0]==='('){
          let k=1;while(/[ \t\n]/.test(tail[k]||'')&&k<tail.length)k++;
          const begin=k;let dest='',valid=true;
          if(tail[k]==='<') {k++;const begin=k;while(k<tail.length&&tail[k]!=='>'&&tail[k]!=='\n'){if(tail[k]==='\\'&&k+1<tail.length)k++;else if(tail[k]==='<')valid=false;k++;}if(tail[k]!=='>')valid=false;dest=tail.slice(begin,k);k++;}
          else {let balance=0;while(k<tail.length&&!/[ \t\n]/.test(tail[k])){if(tail[k]==='\\'&&k+1<tail.length){k+=2;continue;}if(tail[k]==='(')balance++;if(tail[k]===')'){if(!balance)break;balance--;}k++;}if(balance)valid=false;dest=tail.slice(begin,k);}
          const end=k;while(k<tail.length&&/[ \t\n]/.test(tail[k]))k++;
          if(k>end&&/^["'(]$/.test(tail[k]||'')){const close=tail[k]==='('?')':tail[k];let begin=++k;while(k<tail.length&&tail[k]!==close){if(tail[k]==='\\')k++;k++;}title=tail.slice(begin,k);if(tail[k]!==close||/\n[ \t]*\n/.test(title))valid=false;k++;while(k<tail.length&&/[ \t\n]/.test(tail[k]))k++;}
          if(valid&&tail[k]===')'){target=dest;used=j+k+1;}
        } else {let rr=/^\[([^\]]*)\]/.exec(tail);let key=(rr?(rr[1]||label):label).trim().toLowerCase().toUpperCase().toLowerCase().replace(/\s+/g,' ');if(refs[key]){target=refs[key].url;title=refs[key].title;used=j+(rr?rr[0].length:0);}}
        if(target===null&&tail[0]==='('){const key=label.trim().toLowerCase().toUpperCase().toLowerCase().replace(/\s+/g,' ');if(refs[key]){target=refs[key].url;title=refs[key].title;used=j;}}
        if(target!==null&&!/``[^`]*`[^`]+``.+/.test(label)&&!(!image&&/<a href=/.test(inline(label,refs,depth+1,false,true,true)))){flush();if(textOnly)out+=inline(label,refs,depth+1,true);else if(image)out+='<img src="'+href(target)+'" alt="'+inline(label,refs,depth+1,true)+'"'+(title?' title="'+attr(unesc(title))+'"':'')+'>';else out+='<a href="'+href(target)+'"'+(title?' title="'+attr(unesc(title))+'"':'')+'>'+inline(label,refs,depth+1,false,true)+'</a>';i+=used;continue;}
      }
    }
    if ((ch==='*'||ch==='_')&&!masked.some(([a,b])=>i>=a&&i<b)&&(m=/^[*_]+/.exec(rest))) {
      const ch=rest[0], run=new RegExp('^'+(ch==='*'?'\\*':'_')+'+').exec(rest)[0];
      save();
      const prev=src.charCodeAt(i-1), prev2=src.charCodeAt(i-2);
      const before=i?src.slice(i-(prev>=0xdc00&&prev<=0xdfff&&prev2>=0xd800&&prev2<=0xdbff?2:1),i):'', after=i+run.length<src.length?String.fromCodePoint(src.codePointAt(i+run.length)):'';
      const left=!space(after)&&(!punct(after)||space(before)||punct(before));
      const right=!space(before)&&(!punct(before)||space(after)||punct(after));
      const d={ch,original:run.length,len:run.length,open:left&&(ch==='*'||!right||punct(before)),close:right&&(ch==='*'||!left||punct(after))};
      nodes.push(d);delimiters.push(d);i+=run.length;continue;
    }
    if(rest[0]==='~') {
      const run=/^~+/.exec(rest)[0];
      if(run.length<=2){save();const d={ch:'~',len:run.length,open:!/[\s~]/.test(rest[run.length]||' '),close:!/\s/.test(src[i-1]||' ')};nodes.push(d);delimiters.push(d);i+=run.length;continue;}
    }
    if (ch==='&' && (m=/^&#(?:[0-9]{1,7}|[xX][0-9a-fA-F]{1,6});/.exec(rest))) {flush();const n=m[0][2].toLowerCase()==='x'?parseInt(m[0].slice(3,-1),16):+m[0].slice(2,-1);out+=esc(String.fromCodePoint(!n||n>0x10ffff||(n>=0xd800&&n<=0xdfff)?0xfffd:n));i+=m[0].length;continue;}
    if (src[i]==='&' && (m=/^&[a-z][\da-z]*;/i.exec(rest))) {flush();out+=m[0];i+=m[0].length;continue;}
    if(src[i]==='~'){const run=/^~+/.exec(rest)[0];plain+=run;i+=run.length;continue;}
    if(src[i]==='`'){const run=/^`+/.exec(rest)[0];plain+=run;i+=run.length;continue;}
    plain+=src[i++];
    if(!/[\s(<]/.test(src[i-1])){plainRun.lastIndex=i;const run=plainRun.exec(src);if(run){plain+=run[0];i=plainRun.lastIndex;}}
  }
  save();
  for(let ci=0;ci<delimiters.length;ci++){
    const closer=delimiters[ci];
    while(closer.close&&closer.len){
      let oi=ci-1;
      for(;oi>=0;oi--){const opener=delimiters[oi];
        if(opener.len===2&&closer.len===1&&nodes.slice(nodes.indexOf(opener)+1,nodes.indexOf(closer)).some(n=>/<(?:em|strong)>/.test(n.html||''))&&delimiters.slice(ci+1).some(d=>d.ch===closer.ch&&d.close&&d.len>=2))continue;
        if(opener.len&&opener.open&&opener.ch===closer.ch&&(closer.ch!=='~'||opener.len===closer.len)&& !(closer.ch!=='~'&&(opener.close||closer.open)&&(opener.len+closer.len)%3===0&&(opener.len%3!==0||closer.len%3!==0)))break;
      }
      if(oi<0)break;
      const opener=delimiters[oi], use=opener.len>=2&&closer.len>=2?2:1;
      const a=nodes.indexOf(opener), b=nodes.indexOf(closer), tag=closer.ch==='~'?'del':use===2?'strong':'em';
      let body=nodes.slice(a+1,b).map(n=>n.html??n.ch.repeat(n.len)).join('');
      if(use===1&&closer.ch==='*'&&opener.original===1&&/(?:^|\s)<strong>[^]*<\/strong>[\p{L}\p{N}]/u.test(body)){opener.open=false;continue;}
      if(use===2&&opener.len===2&&closer.len===3&&/<\/em>[\p{L}\p{N}]+$/u.test(body)){body+='*';closer.len--;}
      nodes.splice(a+1,b-a-1,{html:(textOnly?'':'<'+tag+'>')+body+(textOnly?'':'</'+tag+'>')});
      opener.len-=use;closer.len-=use;
      delimiters.splice(oi+1,ci-oi-1);ci=oi+1;
    }
  }
  return nodes.map(n=>n.html??n.ch.repeat(n.len)).join('');
}

const blank = s => /^[ \t]*$/.test(s);
const listMark = s => /^ {0,3}([-+*]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/.exec(s || '');
const thematic = s => /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(s);
const interrupts = s => {const m=listMark(s); return m && !thematic(s) && (m[3]||'').trim() && (!/\d/.test(m[1]) || +m[1].slice(0,-1)===1);};
function splitCells(row) {
  row=row.trim();
  if(row.startsWith('|'))row=row.slice(1);
  if(/(?<!\\)(?:\\\\)*\|$/.test(row))row=row.slice(0,-1);
  const cells=[];let cell='';
  for(let i=0;i<row.length;i++){
    if(row[i]==='|'){
      let n=0;for(let j=cell.length-1;j>=0&&cell[j]==='\\';j--)n++;
      if(n%2){cell=cell.slice(0,-1)+'|';continue;}
      cells.push(cell.trim());cell='';
    }else cell+=row[i];
  }
  cells.push(cell.trim());return cells;
}
function htmlKind(s) {
  if(/^ {0,3}<(script|pre|style|textarea)(?=[ \t>]|$)/i.test(s))return 1;
  if(/^ {0,3}<!--/.test(s))return 2;
  if(/^ {0,3}<\?/.test(s))return 3;
  if(/^ {0,3}<![A-Z]/.test(s))return 4;
  if(/^ {0,3}<!\[CDATA\[/.test(s))return 5;
  if(/^ {0,3}<\/?(?:address|article|aside|base|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?=[ \t/>]|$)/i.test(s))return 6;
  if(/^ {0,3}(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:"[^"\x00]*"|'[^'\x00]*'|[^\s"'=<>`]+))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)[ \t]*$/.test(s))return 7;
  return 0;
}
function quoteLine(line) {
  const m=/^( {0,3})>(.*)$/.exec(line);if(!m)return null;
  let rest=m[2],col=m[1].length+1,prefix='',i=0;
  while(i<rest.length&&/[ \t]/.test(rest[i])){const n=rest[i]==='\t'?4-col%4:1;prefix+=' '.repeat(n);col+=n;i++;}
  return (prefix?prefix.slice(1):'')+rest.slice(i);
}
function tokenize(source, refs, def) {
  const lines=source.split('\n');
  // Each recursive block parse owns its line array and emits structured tokens.
  function blocks(rawInput, inList=false) {
    const breaks = s => {const m=listMark(s); return m && !thematic(s) && (m[3]||'').trim() && (!/\d/.test(m[1]) || +m[1].slice(0,-1)===1 || inList);};
    const input=rawInput.map(line=>line.replace(/^[ \t]+/,ws=>{let col=0;for(const c of ws)col+=c==='\t'?4-col%4:1;return ' '.repeat(col);}));
    const dedent=(line,n)=>{let col=0,j=0;while(j<line.length&&col<n&&/[ \t]/.test(line[j])){col+=line[j++]==='\t'?4-col%4:1;}return ' '.repeat(Math.max(0,col-n))+line.slice(j);};
    const tokens=[]; let i=0, blankSeen=false, before=false;
    const emit=t=>{t.blankBefore=before;tokens.push(t);};
    while(i<input.length) {
      let s=input[i],m;
      if(blank(s)){blankSeen=true;i++;continue;}
      before=blankSeen;blankSeen=false;
      if((m=/^ {0,3}(`{3,}(?!`)|~{3,})(.*)$/.exec(s))&&(m[1][0]==='~'||!m[2].includes('`'))){const indent=m[1][0]==='~'?0:s.length-s.trimStart().length,mark=m[1],body=[];i++;while(i<input.length&&!new RegExp('^ {0,3}'+mark[0]+'{'+mark.length+',}\\s*$').test(input[i]))body.push(indent&&rawInput[i].startsWith('\t')?rawInput[i++].slice(1):dedent(rawInput[i++],indent));if(i<input.length)i++;emit({type:'code',text:body.join('\n')+(body.length&&body.at(-1)!==''?'\n':''),info:m[2].trim().split(/\s+/)[0]||''});continue;}
      if(/^ {4}/.test(s)){const body=[];while(i<input.length&&(/^ {4}/.test(input[i])||blank(input[i]))){body.push(dedent(rawInput[i],4));i++;}while(body.length&&!body.at(-1))body.pop();if(body.length)emit({type:'code',text:body.join('\n')+'\n'});continue;}
      def.lastIndex=0;
      const definition=/^ {0,3}\[/.test(s)?def.exec(input.slice(i).join('\n')):null;
      if(definition&&definition.index===0){const [all,label,url,a,b,c]=definition;if(label.trim()&&!/(?<!\\)\[/.test(label)&&!/\n[ \t]*\n/.test(label)&&![a,b,c].some(x=>x!==undefined&&/\n[ \t]*\n/.test(x))){const key=label.trim().toLowerCase().toUpperCase().toLowerCase().replace(/\s+/g,' ');if(!(key in refs))refs[key]={url:url.replace(/^<|>$/g,''),title:a??b??c??''};emit({type:'definition'});i+=all.split('\n').length-(all.endsWith('\n')?1:0);continue;}}
      if((m=/^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/.exec(s))){emit({type:'heading',level:m[1].length,text:m[2].replace(/(?:^|[ \t]+)#+[ \t]*$/,'').trim()});i++;continue;}
      if(/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(s)){emit({type:'hr'});i++;continue;}
      if((m=/^ {0,3}>[ \t]?(.*)$/.exec(s))){const q=[];while(i<input.length){const z=quoteLine(input[i]);if(z!==null){q.push(z);i++;}else if(q.length&&!blank(q.at(-1))&&(()=>{let t=blocks(q).at(-1);while(t?.type==='blockquote'||t?.type==='list')t=t.type==='blockquote'?t.children.at(-1):t.items.at(-1)?.children.at(-1);return t?.type==='paragraph';})()&&!blank(input[i])&&!(htmlKind(input[i])&&htmlKind(input[i])<7)&&!breaks(input[i])&&!/^ {0,3}(?:#{1,6}(?:\s|$)|`{3,}|~{3,})/.test(input[i])&&!thematic(input[i]))q.push(/^ {0,3}=+[ \t]*$/.test(input[i])?'    '+input[i++]:input[i++]);else break;}const children=blocks(q);for(const t of children)if(t.type==='paragraph')t.text=t.text.replace(/\n {4,}(?=[*+-] )/g,'\n');if(/^ +$/.test(q.at(-1)||'')&&children.at(-1)?.type==='paragraph')children.at(-1).text+='\n'+q.at(-1);emit({type:'blockquote',children});continue;}
      if((m=listMark(s))){
        const ordered=/\d/.test(m[1]), marker=ordered?m[1].slice(-1):m[1],items=[],start=ordered?+m[1].slice(0,-1):1;
        let listLoose=false;
        while(i<input.length){
          const z=listMark(input[i]);
          if(!z||thematic(input[i])||(/\d/.test(z[1]))!==ordered||(ordered?z[1].slice(-1):z[1])!==marker)break;
          const lead=input[i].length-input[i].trimStart().length;
          const markerEnd=lead+z[1].length;
          let ws=z[2]||'', col=markerEnd, expanded='';
          for(const c of ws){let n=c==='\t'?4-col%4:1;expanded+=' '.repeat(n);col+=n;}
          let content=z[3]||'', pad=expanded.length;
          if(!content.trim()) {content='';pad=1;}
          else if(pad>4){content=expanded.slice(1)+content;pad=1;}
          const indent=markerEnd+pad, item=[content];i++;
          let pending=[],hadBlank=false;
          while(i<input.length){
            const line=input[i];
            if(blank(line)){pending.push('');i++;continue;}
            const spaces=line.length-line.trimStart().length;
            if(!content && pending.length)break;
            if(spaces>=indent){
              if(pending.length){item.push(...pending);hadBlank=true;pending=[];}
              item.push(line.slice(indent));i++;continue;
            }
            const next=listMark(line);
            if(next||thematic(line)||/^ {0,3}(?:>|#{1,6}(?:\s|$)|`{3,}|~{3,})/.test(line))break;
            if(pending.length||!item.at(-1)||/^ {0,3}`{3,}/.test(item.at(-1)))break;
            item.push(line);i++;
          }
          const children=blocks(item,true);for(const t of children)if(t.type==='paragraph')t.text=t.text.replace(/\n {4,}/g,'\n');
          items.push({type:'list_item',children,loose:children.some((c,k)=>k>0&&c.blankBefore)});
          if(pending.length)blankSeen=true;
          const next=listMark(input[i]);
          if(pending.length&&next&&!thematic(input[i])&&(/\d/.test(next[1]))===ordered&&(ordered?next[1].slice(-1):next[1])===marker)listLoose=true;
        }
        if(listLoose)for(const item of items)item.loose=true;
        emit({type:'list',ordered,start,items});continue;
      }
      const hk=htmlKind(s);
      if(hk){const buf=[];const tag=/^ {0,3}<(\w+)/.exec(s)?.[1];const end=hk===1?new RegExp('</'+tag+'\\s*>','i'):hk===2?/-->|^ {0,3}<!---?>/:hk===3?/\?>/:hk===4?/>/:/\]\]>/;
        while(i<input.length){if(hk>=6&&blank(input[i]))break;const line=rawInput[i++];buf.push(line);if(hk<6&&end.test(line))break;}
        const newline=hk<6?(hk===2?(input[i]!==undefined&&input[i]!==''):i<input.length&&(input[i]!==''||i===input.length-1)):i===input.length-1&&blank(input[i]);
        emit({type:'html',text:buf.join('\n')+(newline?'\n':'')});continue;}
      if(i+1<input.length&&s.includes('|')){
        const head=splitCells(s), delimiter=splitCells(input[i+1]);
        if(head.length===delimiter.length&&delimiter.every(c=>/^:?-+:?$/.test(c))){
          const t={type:'table',head,align:delimiter.map(x=>x.startsWith(':')&&x.endsWith(':')?'center':x.startsWith(':')?'left':x.endsWith(':')?'right':''),rows:[]};
          emit(t);i+=2;
          while(i<input.length&&(!blank(input[i])||rawInput[i].includes('\t'))&&!interrupts(input[i])&&!thematic(input[i])&&!/^ {0,3}(?:>|#{1,6}(?:\s|$)|`{3,}|~{3,})/.test(input[i])&&!(htmlKind(input[i])&&htmlKind(input[i])<7))t.rows.push(splitCells(input[i++]));
          continue;
        }
      }
      const para=[s];i++;
      while(i<input.length&&!blank(input[i])){if(htmlKind(input[i])&&htmlKind(input[i])<7)break;if(/^ {0,3}(?:=+|-+)[ \t]*$/.test(input[i]))break;if(/^ {0,3}(?:#{1,6}(?:\s|$)|>|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$|`{3,}(?!`)[^`]*$|~{3,})/.test(input[i])||breaks(input[i]))break;para.push(/\[[^\]]*$/.test(para.join('\n'))?input[i++]:input[i++]);}
      if(i<input.length&&(m=/^ {0,3}(=+|-+)[ \t]*$/.exec(input[i]))){emit({type:'heading',level:m[1][0]==='='?1:2,text:para.join('\n').trim()});i++;}else emit({type:'paragraph',text:para.join('\n')});
    }
    return tokens;
  }
  return blocks(lines);
}
function hasAnchor(tokens) {
  return tokens.some(t=> /<a(?:\s|>)/i.test(t.text||'') || (t.children&&hasAnchor(t.children)) || (t.items&&t.items.some(item=>hasAnchor(item.children))) || (t.head&&t.head.some(s=>/<a(?:\s|>)/i.test(s))) || (t.rows&&t.rows.some(row=>row.some(s=>/<a(?:\s|>)/i.test(s)))));
}
function render(tokens, refs, parentLoose=false) {
  let out='';
  for(const t of tokens){
    if(t.type==='heading')out+='<h'+t.level+'>'+inline(t.text,refs)+'</h'+t.level+'>\n';
    else if(t.type==='paragraph')out+=(parentLoose?'<p>':'<p>')+inline(t.text,refs)+'</p>\n';
    else if(t.type==='code')out+='<pre><code'+(t.info?' class="language-'+attr(unesc(t.info).replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/g,'$1'))+'"':'')+'>'+esc(t.text)+'</code></pre>\n';
    else if(t.type==='hr')out+='<hr>\n';
    else if(t.type==='html')out+=t.text;
    else if(t.type==='blockquote')out+='<blockquote>\n'+render(t.children,refs)+'</blockquote>\n';
    else if(t.type==='list'){const tag=t.ordered?'ol':'ul';out+='<'+tag+(t.ordered&&t.start!==1?' start="'+t.start+'"':'')+'>\n';for(const original of t.items){let item=original,checkbox='';const first=item.children[0],task=first?.type==='paragraph'&&/^\[([ xX])\][ \t]+/.exec(first.text);if(task){checkbox='<input '+(task[1]!==' '?'checked="" ':'')+'disabled="" type="checkbox"> ';item={...item,children:[{...first,text:first.text.slice(task[0].length)},...item.children.slice(1)]};}let body;if(t.items.some(x=>x.loose)||hasAnchor(item.children))body=render(item.children,refs,t.items.some(x=>x.loose));if(!t.items.some(x=>x.loose))body=item.children.map((child,k)=>child.type==='paragraph'?inline(child.text,refs):render([child],refs)).join('');if(checkbox)body=body.startsWith('<p>')?'<p>'+checkbox+body.slice(3):checkbox+body;out+='<li>'+body+'</li>\n';}out+='</'+tag+'>\n';}
    else if(t.type==='table'){out+='<table>\n<thead>\n<tr>\n';for(let k=0;k<t.head.length;k++)out+='<th'+(t.align[k]?' align="'+t.align[k]+'"':'')+'>'+inline(t.head[k],refs)+'</th>\n';out+='</tr>\n</thead>\n';if(t.rows.length){out+='<tbody>';for(const row of t.rows){out+='<tr>\n';for(let k=0;k<t.head.length;k++)out+='<td'+(t.align[k]?' align="'+t.align[k]+'"':'')+'>'+inline(row[k]||'',refs)+'</td>\n';out+='</tr>\n';}out+='</tbody>';}out+='</table>\n';}
  }
  return out;
}
export function parse(markdown) {
  if(typeof markdown!=='string')throw new TypeError('markdown must be a string');
  markdown=markdown.replace(/\r\n?/g,'\n');
  const refs=Object.create(null), def=/^ {0,3}\[((?:\\.|[^\]\\])+)\]:[ \t]*(?:\n[ \t]*)?(<[^>]*>|(?!<)\S+)(?:(?:[ \t]+|[ \t]*\n[ \t]*)(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\)))?[ \t]*(?:\n|$)/gm;

  const tokens=tokenize(markdown,refs,def);
  return render(tokens,refs);
}
