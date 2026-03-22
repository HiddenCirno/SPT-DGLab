using BepInEx;
using HarmonyLib;
using Newtonsoft.Json;
using System;

namespace SPTDGLab
{
    [BepInPlugin(PluginsInfo.GUID, PluginsInfo.NAME, PluginsInfo.VERSION)]
    public class PluginsCore : BaseUnityPlugin
    {
        //客户端ID
        public static string ClientId;
        //服务器地址
        public static string ServerUrl;
        //WebSocket地址
        public static string WebSocketUrl;
        private void Awake()
        {
            //初始化配置
            CfgManager.Initialize(Config);
            //生成客户端ID
            ClientId = Guid.NewGuid().ToString();
            //生成控制链接
            string localIp = CfgManager.ForcedBindIP.Value ? CfgManager.IPAddress.Value : HttpManager.GetLocalIPAddress();
            ServerUrl = localIp;
            string wsUrl = $"ws://{ServerUrl}:{CfgManager.WebSocketPort.Value}";
            WebSocketUrl = wsUrl;
            string qrContent = $"https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#{WebSocketUrl}/{ClientId}";
            //启动WS服务器
            WebSocketManager.StartWebSocketServer();
            //启动二维码广播
            HttpManager.StartHttpServer(qrContent);
            //日志输出
            Logger.LogInfo("==================================================");
            Logger.LogInfo("[DG-LAB] 游戏内置通讯与 Web 服务已启动！");
            Logger.LogInfo($"[DG-LAB] 请在浏览器打开以下地址获取二维码：");
            Logger.LogInfo($"[DG-LAB] http://{ServerUrl}:{CfgManager.HttpPort.Value}/");
            Logger.LogInfo("==================================================");
            //启动Patch
            var harmony = new Harmony(PluginsInfo.GUID);
            harmony.PatchAll();
        }
        private void Update()
        {
            //测试用代码
            /*
            // 仅作测试用：按 F9 给 A通道 增加 5点强度
            if (UnityEngine.Input.GetKeyDown(UnityEngine.KeyCode.F9))
            {
                SendStrengthCommand(1, 1, 5);
            }

            // 仅作测试用：按 F10 给 A通道 减少 5点强度
            if (UnityEngine.Input.GetKeyDown(UnityEngine.KeyCode.F10))
            {
                SendStrengthCommand(1, 0, 5);
            }

            // 仅作测试用：按 F11 瞬间清零，作为安全保命键
            if (UnityEngine.Input.GetKeyDown(UnityEngine.KeyCode.F11))
            {
                SendStrengthCommand(1, 2, 0);
                SendStrengthCommand(2, 2, 0);
            }
            */
        }
        //发送强度控制指令
        public static void SendStrengthCommand(int channel, int mode, int value)
        {
            //安全检查
            if (string.IsNullOrEmpty(WebSocketManager.DGLabBehavior.targetId))
            {
                Console.WriteLine("[DG-LAB] 尚未连接设备，跳过发送。");
                return;
            }

            //构造控制命令
            string messageContent = $"strength-{channel}+{mode}+{value}";
            //构造请求
            var payload = new
            {
                type = "msg",
                clientId = ClientId,
                targetId = WebSocketManager.DGLabBehavior.targetId,
                message = messageContent
            };

            string json = JsonConvert.SerializeObject(payload);

            try
            {
                //通过WS发送给设备
                WebSocketManager.wss.WebSocketServices[$"/{ClientId}"].Sessions.Broadcast(json);
                Console.WriteLine($"[DG-LAB] 已发送强度控制指令: {messageContent}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DG-LAB] 发送指令失败: {ex.Message}");
            }
        }
        //关闭进程
        //无实际作用, 仅做规范
        private void OnDestroy()
        {
            HttpManager.OnDestroy();
            var harmony = new Harmony(PluginsInfo.GUID);
            harmony.UnpatchSelf();
        }
    }
}