using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Timers;
using WebSocketSharp;
using WebSocketSharp.Server;

namespace SPTDGLab
{
    internal class WebSocketManager
    {
        //ws实例
        public static WebSocketServer wss;
        //WebSocket通信协议构建
        public class DGLabBehavior : WebSocketBehavior
        {
            //手机控制端ID
            public static string targetId = "";
            //心跳计时器
            public Timer heartbeatTimer;
            //波形计时器
            public Timer pulseTimer;
            //AB通道波形数据
            private int pulseIndexA = 0;
            private int pulseIndexB = 0;
            //APP连接事件
            protected override void OnOpen()
            {
                Console.WriteLine("[DG-LAB] 侦测到设备连接，开始握手...");
                //下发ID绑定
                var bindMsg = new
                {
                    type = "bind",
                    clientId = PluginsCore.ClientId,
                    targetId = "",
                    message = "targetId"
                };
                Send(JsonConvert.SerializeObject(bindMsg));
                //启动静默心跳服务
                heartbeatTimer = new Timer(30000);
                heartbeatTimer.Elapsed += (sender, e) => SendHeartbeat();
                heartbeatTimer.Start();
                pulseTimer = new Timer(1000);
                //启动波形服务
                pulseTimer.Elapsed += (sender, e) => SendPulseData();
                pulseTimer.Start();
            }
            //消息处理
            protected override void OnMessage(MessageEventArgs e)
            {
                if (!e.IsText) return;

                try
                {
                    //解析消息
                    var data = JsonConvert.DeserializeObject<WSMessage>(e.Data);
                    //消息为空, 返回
                    if (data == null) return;
                    //处理绑定请求
                    if (data.type == "bind" && data.message == "DGLAB")
                    {
                        //控制端ID
                        targetId = data.targetId;
                        Console.WriteLine($"[DG-LAB] 收到 App 绑定请求，TargetID: {targetId}");

                        //下发200代码完成绑定
                        var successMsg = new
                        {
                            type = "bind",
                            clientId = PluginsCore.ClientId,
                            targetId = targetId,
                            message = "200"
                        };
                        Send(JsonConvert.SerializeObject(successMsg));
                        Console.WriteLine("[DG-LAB] 绑定成功！连接通道已建立。");
                        //设置基础强度
                        StrengthController.SetBaseStrength(1, CfgManager.BaseStrengthCountA.Value);
                        StrengthController.SetBaseStrength(2, CfgManager.BaseStrengthCountB.Value);
                    }
                    else if (data.type == "msg" && data.message.StartsWith("strength-"))
                    {
                        try
                        {
                            //处理回传消息
                            string[] parts = data.message.Replace("strength-", "").Split('+');
                            if (parts.Length >= 4)
                            {
                                int currentA = int.Parse(parts[0]);
                                int currentB = int.Parse(parts[1]);
                                int maxA = int.Parse(parts[2]);
                                int maxB = int.Parse(parts[3]);
                                //记录设备强度上限
                                StrengthController.DeviceMaxA = maxA;
                                StrengthController.DeviceMaxB = maxB;
                                //回传日志
                                Console.WriteLine($"[DG-LAB] 设备状态已同步 | A通道: {currentA}(上限{maxA}) | B通道: {currentB}(上限{maxB})");
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[DG-LAB] 解析设备状态异常: {ex.Message}");
                        }
                    }
                    //心跳包处理
                    else if (data.type == "heartbeat")
                    {
                        //留空
                        //这里应该有一条日志, 但我懒得写了, 心跳日志会刷屏
                        //虽然现在的协议也会出现刷屏, 但是心跳是持续刷屏
                    }
                    else
                    {
                        Console.WriteLine($"[DG-LAB] 收到未知或未处理消息: {e.Data}");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[DG-LAB] JSON 解析错误: {ex.Message}");
                }
            }

            protected override void OnClose(CloseEventArgs e)
            {
                Console.WriteLine("[DG-LAB] 连接已断开。");
                //清空基础强度
                StrengthController.SetBaseStrength(1, 0);
                StrengthController.SetBaseStrength(2, 0);
                //关闭心跳服务
                if (heartbeatTimer != null)
                {
                    heartbeatTimer.Stop();
                    heartbeatTimer.Dispose();
                }
                //关闭波形服务
                if (pulseTimer != null)
                {
                    pulseTimer.Stop();
                    pulseTimer.Dispose();
                }
                //清除控制端ID
                targetId = "";
            }
            //心跳包
            private void SendHeartbeat()
            {
                if (!string.IsNullOrEmpty(targetId))
                {
                    //构建请求
                    var heartbeatMsg = new
                    {
                        type = "heartbeat",
                        clientId = PluginsCore.ClientId,
                        targetId = targetId,
                        message = "ping" //协议规定message不能为空, 填ping或者200都可以
                    };

                    try
                    {
                        //发送心跳
                        Send(JsonConvert.SerializeObject(heartbeatMsg));
                        //Console.WriteLine("[DG-LAB] 心跳包发送成功，维持连接保活。"); 
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[DG-LAB] 心跳包发送异常: {ex.Message}");
                    }
                }
            }
            //波形服务
            private void SendPulseData()
            {
                if (string.IsNullOrEmpty(targetId)) return;
                //当前选择的波形
                string waveNameA = WaveformCfg.ChannelAWaveform.Value;
                string waveNameB = WaveformCfg.ChannelBWaveform.Value;
                //从字典读取波形数据
                string[] pulseDataA = WaveformManager.Waveforms.ContainsKey(waveNameA) ? WaveformManager.Waveforms[waveNameA] : WaveformManager.Waveforms.Values.First();
                string[] pulseDataB = WaveformManager.Waveforms.ContainsKey(waveNameB) ? WaveformManager.Waveforms[waveNameB] : WaveformManager.Waveforms.Values.First();
                //每次截取10条数据并构造完整结构
                //官方定义每条数据为100ms, 10条即1s
                string payloadA = GetNextPulseChunk(pulseDataA, ref pulseIndexA, 10);
                string payloadB = GetNextPulseChunk(pulseDataB, ref pulseIndexB, 10);
                //构造波形消息
                string msgA = $"pulse-A:[{payloadA}]";
                string msgB = $"pulse-B:[{payloadB}]";
                //构造请求
                var reqA = new { type = "msg", clientId = PluginsCore.ClientId, targetId = targetId, message = msgA };
                var reqB = new { type = "msg", clientId = PluginsCore.ClientId, targetId = targetId, message = msgB };
                try
                {
                    //下发波形
                    Send(JsonConvert.SerializeObject(reqA));
                    Send(JsonConvert.SerializeObject(reqB));
                }
                catch (Exception) { }
            }
            //波形切片算法
            private string GetNextPulseChunk(string[] waveData, ref int currentIndex, int count)
            {
                List<string> chunk = new List<string>();
                for (int i = 0; i < count; i++)
                {
                    //数组触底, 返回第0帧
                    if (currentIndex >= waveData.Length) currentIndex = 0;
                    //双引号
                    chunk.Add($"\"{waveData[currentIndex]}\"");
                    currentIndex++;
                }
                return string.Join(",", chunk);
            }
        }
        //用于反序列化的数据结构
        public class WSMessage
        {
            public string type { get; set; }
            public string clientId { get; set; }
            public string targetId { get; set; }
            public string message { get; set; }
        }

        //启动WS服务器
        public static void StartWebSocketServer()
        {
            wss = new WebSocketServer(PluginsCore.WebSocketUrl);
            wss.AddWebSocketService<DGLabBehavior>($"/{PluginsCore.ClientId}");
            wss.Start();
        }
    }
}
