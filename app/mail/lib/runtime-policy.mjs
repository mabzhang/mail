/** Same public managed native contract on each platform; never escalates on failure. */
export function runtimePolicy(platform=process.platform){return Object.freeze({platform,profile:'native',network:'external',requiresNativeIdentity:platform==='win32',label:'原生受管运行',notice:'邮件后台经宿主受管运行时连接你配置的 IMAP / SMTP 服务器；需要运行与联网授权。'});}
