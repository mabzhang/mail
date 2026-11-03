import postcss from '../vendor-html/node_modules/postcss/lib/postcss.mjs';

// Received mail is rendered in an isolated frame. Keep its typography and
// responsive layout without allowing CSS downloads or overlays.
const color=/^(?:inherit|transparent|#[a-f0-9]{3,8}|[a-z]+|rgba?\([\d.,% ]+\))$/i;
const length='(?:0|\\d+(?:\\.\\d+)?(?:px|pt|em|rem|%))';
const size=new RegExp('^(?:auto|inherit|'+length+')$');
const spacing=new RegExp('^(?:auto|'+length+')(?:\\s+(?:auto|'+length+')){0,3}$');
export const mailStyles={
 'color':[color],'background-color':[color],
 'font-family':[/^(?:inherit|[\w\s,"'\-\u4e00-\u9fff]+)$/],
 'font-size':[size],'font-weight':[/^(?:inherit|normal|bold|[1-9]00)$/],
 'font-style':[/^(?:normal|italic|inherit)$/],
 'text-decoration':[/^(?:none|underline|line-through|inherit)$/],
 'text-align':[/^(?:left|right|center|justify|inherit)$/],
 'vertical-align':[/^(?:top|middle|bottom|baseline|text-top|text-bottom|inherit)$/],
 'white-space':[/^(?:normal|nowrap|pre|pre-wrap|pre-line)$/],
 'line-height':[/^(?:normal|inherit|\d+(?:\.\d+)?(?:px|pt|em|rem|%)?)$/],
 'display':[/^(?:none|block|inline|inline-block|table|table-row|table-cell|table-row-group|table-header-group|table-footer-group)$/],
 'visibility':[/^(?:visible|hidden|collapse)$/],
 'width':[size],'max-width':[size],'min-width':[size],
 'height':[size],'max-height':[size],'min-height':[size],
 'padding':[spacing],'margin':[spacing],
 'border':[/^(?:none|0|\d+(?:\.\d+)?(?:px|pt|em)?(?:\s+(?:none|solid|dashed|dotted|double))?(?:\s+(?:#[a-f0-9]{3,8}|[a-z]+))?)$/i],
 'border-color':[color],'border-style':[/^(?:none|solid|dashed|dotted|double)$/],
 'border-width':[spacing],'border-radius':[spacing],
 'border-collapse':[/^(?:collapse|separate)$/],
 'border-spacing':[spacing],'table-layout':[/^(?:auto|fixed)$/],
 'word-break':[/^(?:normal|break-all|keep-all|break-word)$/],
 'overflow-wrap':[/^(?:normal|break-word|anywhere)$/],
 'letter-spacing':[/^(?:normal|-?\d+(?:\.\d+)?(?:px|pt|em|rem))$/],
};
for(const side of ['top','right','bottom','left']){
 mailStyles['padding-'+side]=[spacing];mailStyles['margin-'+side]=[spacing];
 mailStyles['border-'+side]=mailStyles.border;
}
const media=/^(?:[\w\s():.,\-]+)$/;
const selector=/^[\w\s.*#:\[\]()=~^$|"',>+\-]+$/;
export function cleanMailCss(input){
 let root;try{root=postcss.parse(String(input||'').slice(0,100000));}catch{return '';}
 function filter(container,depth=0){
  for(const node of [...container.nodes||[]]){
   if(node.type==='atrule'){
    if(depth>3||node.name.toLowerCase()!=='media'||!node.nodes||!media.test(node.params)||/url|import/i.test(node.params)){node.remove();continue;}
    filter(node,depth+1);if(!node.nodes.length)node.remove();
   }else if(node.type==='rule'){
    if(node.selector.length>1000||!selector.test(node.selector)){node.remove();continue;}
    for(const decl of [...node.nodes||[]]){
     const prop=String(decl.prop||'').toLowerCase(),value=String(decl.value||'').trim();
     if(decl.type!=='decl'||!mailStyles[prop]?.some(re=>re.test(value))||/[<>\\]|url\s*\(|expression\s*\(|javascript:|\/\*/i.test(value))decl.remove();
    }
    if(!node.nodes.length)node.remove();
   }else node.remove();
  }
 }
 filter(root);return root.toString();
}
