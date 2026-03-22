using BepInEx.Configuration;

namespace SPTDGLab
{
    internal class CfgManager
    {
        public static ConfigEntry<int> HealthStrengthLimit;
        public static ConfigEntry<int> BodyDestroyStrength;
        public static ConfigEntry<int> ExitStengthCountA;
        public static ConfigEntry<int> ExitStengthCountB;
        public static ConfigEntry<int> BaseStrengthCountA;
        public static ConfigEntry<int> BaseStrengthCountB;
        public static ConfigEntry<string> WebSocketPort;
        public static ConfigEntry<string> HttpPort;
        public static ConfigEntry<bool> ForcedBindIP;
        public static ConfigEntry<string> IPAddress;

        public static void Initialize(ConfigFile config)
        {
            HealthStrengthLimit = config.Bind("强度设置", "生命损失强度上限", 50, "战局内因生命值损失而增加的累加强度的最大值, 默认为50, 会根据强度上限按比例计算");
            BodyDestroyStrength = config.Bind("强度设置", "肢体部位损毁强度", 5, "战局内因肢体损毁而增加/因手术治疗减少的累加强度值, 默认为5, 会根据强度上限按比例计算");
            ExitStengthCountA = config.Bind("强度设置", "A通道撤离强度", 5, "撤离成功/失败后A通道减少/增加的基础强度, 默认为5, 真实数值, 不会按比例减少");
            ExitStengthCountB = config.Bind("强度设置", "B通道撤离强度", 5, "撤离成功/失败后B通道减少/增加的基础强度, 默认为5, 真实数值, 不会按比例减少");
            BaseStrengthCountA = config.Bind("强度设置", "A通道基础强度", 20, "扫码连接后A通道的基础强度, 游戏控制的最低强度无法减少到低于这个值");
            BaseStrengthCountB = config.Bind("强度设置", "B通道基础强度", 20, "扫码连接后B通道的基础强度, 游戏控制的最低强度无法减少到低于这个值");
            WebSocketPort = config.Bind("连接设置", "WebSocket服务器端口", "9999", "WebSocket服务器的启动端口, 修改后重启客户端生效");
            HttpPort = config.Bind("连接设置", "二维码广播端口", "9998", "广播二维码的网页端口, 修改后重启客户端生效");
            ForcedBindIP = config.Bind("连接设置", "强制重定向ip", false, "强制使用配置的ip而非自动获取, 无法连接到服务器请启用此项手动指定服务器ip");
            IPAddress = config.Bind("连接设置", "手动指定ip", "127.0.0.1", "手动指定ip, 请自行搜索如何查询你的ipv4地址并填入, 然后重启客户端");
        }
    }
}
