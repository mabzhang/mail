export function imapFailure(error){
 const code=String(error?.code||'').toUpperCase(),response=String(error?.serverResponseCode||'').toUpperCase();
 let key='IMAP_READ',stage=error?.mailStage==='open-mailbox'?'open-mailbox':error?.mailStage==='connect'?'connect':'read',message='邮箱读取失败；请先测试收件并核对授权码、IMAP 权限与网络。';
 if(['ENOTFOUND','EAI_AGAIN'].includes(code)){key='IMAP_DNS';stage='connect';message='无法解析 IMAP 服务器地址。请核对服务器地址、DNS，并换用手机热点测试。';}
 else if(/CERT|TLS|SSL|UNABLE_TO_VERIFY|DEPTH_ZERO/.test(code)){key='IMAP_TLS';stage='tls';message='IMAP 安全连接证书验证失败。请检查系统日期、服务器地址，以及公司代理或终端防护的证书配置。';}
 else if(['ETIMEDOUT','ETIMEOUT','CONNECT_TIMEOUT','GREETING_TIMEOUT','SOCKET_TIMEOUT','CONNECTTIMEOUT','CONNECTIONTIMEOUT','GREETINGTIMEOUT','SOCKETTIMEOUT'].includes(code)){key='IMAP_TIMEOUT';stage='connect';message='IMAP 连接超时。请检查服务器与 993 端口、网络、防火墙，并换用手机热点测试。';}
 else if(['ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH','EPIPE','ESOCKET'].includes(code)){key='IMAP_NETWORK';stage='connect';message='IMAP 网络连接失败或被断开。请核对服务器与端口、代理、公司网络及邮箱登录 IP 策略。';}
 else if(error?.authenticationFailed||['EAUTH','AUTHENTICATIONFAILED','AUTHENTICATION_FAILED'].includes(code)||['AUTHENTICATIONFAILED','AUTHORIZATIONFAILED'].includes(response)){key='IMAP_AUTH';stage='authenticate';message='IMAP 登录被服务器拒绝。请使用此账号新生成的三方客户端安全密码，并让邮箱管理员检查三方客户端、IMAP 和登录 IP 权限。';}
 else if(['NONEXISTENT','TRYCREATE'].includes(response)||stage==='open-mailbox'){key='IMAP_FOLDER';stage='open-mailbox';message='登录后无法打开邮件文件夹。请刷新文件夹列表，或让邮箱管理员检查 IMAP 服务权限。';}
 else if(error?.message==='邮箱已重建，请重新同步'){key='IMAP_REBUILT';message='邮箱目录已重建，请先刷新邮件列表，再打开邮件。';}
 else if(error?.message==='邮件不存在，请刷新'){key='IMAP_NOT_FOUND';message='原邮件已不存在，请刷新邮件列表。';}
 // Never return server responses, raw error text, credentials, or mail content.
 return {errorCode:key,stage,error:'['+key+'] '+message};
}
