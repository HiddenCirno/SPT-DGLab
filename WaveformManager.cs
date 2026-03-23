using BepInEx.Configuration;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;

namespace SPTDGLab
{
    //波形管理器
    public static class WaveformManager
    {
        //波形字典
        public static Dictionary<string, string[]> Waveforms = new Dictionary<string, string[]>();
        public static void Initialize()
        {
            try
            {
                //读取waves.json
                string pluginFolder = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                string jsonPath = Path.Combine(pluginFolder, "waves.json");
                //文件存在, 反序列化成对象后存入字典
                if (File.Exists(jsonPath))
                {
                    string jsonContent = File.ReadAllText(jsonPath);
                    var rawData = JsonConvert.DeserializeObject<List<WaveformJsonModel>>(jsonContent);
                    foreach (var item in rawData)
                    {
                        if (!string.IsNullOrEmpty(item.name) && item.expectedV3 != null && item.expectedV3.Length > 0)
                        {
                            Waveforms[item.name] = item.expectedV3;
                        }
                    }
                    Console.WriteLine($"[DG-LAB] 成功加载 {Waveforms.Count} 个官方波形数据。");
                }
                else
                {
                    Console.WriteLine($"[DG-LAB] 未找到波形文件: {jsonPath}，将使用默认平滑波形。");
                    LoadDefaultWaveform();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DG-LAB] 读取波形文件失败: {ex.Message}，将使用默认平滑波形。");
                LoadDefaultWaveform();
            }
        }
        //无波形文件将传递一个默认波形
        private static void LoadDefaultWaveform()
        {
            string[] defaultPulse = new string[10];
            for (int i = 0; i < 10; i++) defaultPulse[i] = "0A0A0A0A16321664";
            Waveforms["默认波形"] = defaultPulse;
        }
    }
    //用于反序列化的数据结构
    public class WaveformJsonModel
    {
        public string name { get; set; }
        public string[] expectedV3 { get; set; }
    }
    //配置定义
    //和CfgManager分离做区分
    public class WaveformCfg
    {
        public static ConfigEntry<string> ChannelAWaveform;
        public static ConfigEntry<string> ChannelBWaveform;

        public static void Initialize(ConfigFile config)
        {
            //咦. 这里原来初始化了, 那我不需要再调一次
            WaveformManager.Initialize();
            string[] waveNames = WaveformManager.Waveforms.Keys.ToArray();
            string defaultWave = waveNames.Length > 0 ? waveNames[0] : "默认波形";
            //配置声明
            ChannelAWaveform = config.Bind("波形设置", "A通道波形", defaultWave, new ConfigDescription("选择A通道播放的波形", new AcceptableValueList<string>(waveNames)));
            ChannelBWaveform = config.Bind("波形设置", "B通道波形", defaultWave, new ConfigDescription("选择B通道播放的波形", new AcceptableValueList<string>(waveNames)));
        }

    }
}

