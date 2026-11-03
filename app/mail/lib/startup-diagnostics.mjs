// Retain known startup codes only, never raw runtime logs or mailbox content.
export const STARTUP_CODES=new Set(['EADDRINUSE','EACCES','EPERM','ENOENT','ERR_MODULE_NOT_FOUND','ERR_DLOPEN_FAILED','VAULT_KEY','LOCAL_DATA','NATIVE_IDENTITY','PERMISSION','LOCAL_MACHINE_PERMISSION','NETWORK_PERMISSION','EXECUTE_PERMISSION','HELPER_UNAVAILABLE','HELPER_INCOMPATIBLE','NODE_UNAVAILABLE','TIMEOUT','RUNTIME_RPC_TIMEOUT','CHILD_EXIT','START_FAILED','SERVICE_LOST','CANCELLED']);
export function startupCode(error){
 if(STARTUP_CODES.has(error?.code))return error.code;
 const text=String(error?.message||error||'');
 const code=String(error?.code||'');
 if(code==='APP_RUNTIME_LOCAL_MACHINE_DENIED'||/app\/runtime\.local-machine.*capability|local-machine execution requires/i.test(text))return 'LOCAL_MACHINE_PERMISSION';
 if(code==='APP_RUNTIME_NETWORK_DENIED')return 'NETWORK_PERMISSION';
 if(code==='APP_RUNTIME_CAPABILITY_DENIED')return 'EXECUTE_PERMISSION';
 if(/(?:required .*windows sandbox helper is unavailable|sandbox helper.*(?:missing|not found))/i.test(text))return 'HELPER_UNAVAILABLE';
 if(/normal-token Job support|runtime requires an updated .*windows.*helper/i.test(text))return 'HELPER_INCOMPATIBLE';
 if(/initialize-native-identity|native sandbox initialization|native identity.*(?:required|missing|not ready)/i.test(text))return 'NATIVE_IDENTITY';
 if(/凭据密钥|发送缓存密钥|无法解密/.test(text))return 'VAULT_KEY';
 if(/本地 .+ 无法读取/.test(text))return 'LOCAL_DATA';
 for(const code of ['EADDRINUSE','EACCES','EPERM','ERR_MODULE_NOT_FOUND','ERR_DLOPEN_FAILED','ENOENT'])if(new RegExp('\\b'+code+'\\b').test(text))return code;
 if(/APP_CAPABILITY|forbidden|permission denied|not granted|授权|权限/i.test(text))return 'PERMISSION';
 if(/node.*(?:not found|unavailable|missing)|runtime.*not available/i.test(text))return 'NODE_UNAVAILABLE';
 return 'START_FAILED';
}
export function startupMessage(code,record={}){
 const messages={
 LOCAL_MACHINE_PERMISSION:'Windows 邮件后台的本机运行权限未授予。请到宿主「设置 → 安全 → 应用权限 → Mail」开启本机运行（app/runtime.local-machine），再点击「重新连接后台」。不需要管理员 PowerShell 初始化。',
 NETWORK_PERMISSION:'邮件后台联网权限未授予。请在宿主的邮件 App 权限中开启「允许受管程序联网」，再重新连接后台。',
 EXECUTE_PERMISSION:'邮件后台运行权限未授予。请在宿主的邮件 App 权限中开启「运行受控程序」，再重新连接后台。',
 HELPER_UNAVAILABLE:'当前安装目录缺少 Windows 受管运行辅助程序。请导出启动诊断，核对正在使用的安装目录；无需重复执行管理员初始化。',
 HELPER_INCOMPATIBLE:'当前 Windows 辅助程序不支持本机受管运行。请导出启动诊断并交给维护人员核对宿主版本；本扩展不会自动更换主程序。',
 EADDRINUSE:'邮件后台本地端口被占用，自动更换端口后仍未成功。请完全退出主程序后重试。',
 EACCES:'系统拒绝邮件后台访问。请导出启动诊断，核对失败阶段与系统访问策略。',
 EPERM:'系统拒绝邮件后台访问。请导出启动诊断，核对文件访问与 Windows 安全策略。',
 ENOENT:'邮件后台所需文件不存在。请保留账号数据，并用完整邮件扩展包覆盖安装。',
 ERR_MODULE_NOT_FOUND:'邮件扩展的后台依赖未找到。请用完整邮件扩展包覆盖安装。',
 ERR_DLOPEN_FAILED:'邮件后台依赖无法载入。请导出启动诊断核对运行环境。',
 VAULT_KEY:'本地发送缓存密钥无法使用。请保留现有数据，勿删除密钥或账号文件。',
 LOCAL_DATA:'邮件后台无法读取本地数据。请保留文件并导出启动诊断。',
 NATIVE_IDENTITY:'Windows 原生沙箱尚未初始化，或与当前用户、数据目录不匹配。请用当前账号运行一键修复工具。',
 PERMISSION:'宿主拒绝邮件后台运行。请核对邮件 App 的受管运行、原生访问和联网授权。',
 NODE_UNAVAILABLE:'宿主未找到可用的 Node 运行环境。请导出启动诊断。',
 RUNTIME_RPC_TIMEOUT:'宿主未及时回应后台启动或状态查询。页面已保持可用，请完全退出主程序（含托盘）后重开，再重新连接。此错误不代表邮箱授权码有误。',
 TIMEOUT:'邮件后台在 60 秒内未就绪。请导出启动诊断，查看最后启动阶段。',
 CHILD_EXIT:'邮件后台进程已退出'+(Number.isInteger(record.exitCode)?'（退出码 '+record.exitCode+'）':'')+'。请导出启动诊断定位原因。',
 START_FAILED:'邮件后台启动失败。请在邮箱设置中导出启动诊断；当前信息不足以判定原因。',
 SERVICE_LOST:'邮件后台连接已中断。可在邮箱设置中重新连接后台。',
 CANCELLED:'邮件后台已停止。'};
 return messages[code]||messages.START_FAILED;
}
