using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
namespace SPTDGLab
{
    internal class HttpManager
    {
        //http实例
        public static HttpListener httpListener;
        //启动http服务器
        public static void StartHttpServer(string qrContent)
        {
            httpListener = new HttpListener();
            //广播地址
            httpListener.Prefixes.Add($"http://{PluginsCore.ServerUrl}:{CfgManager.HttpPort.Value}/");
            httpListener.Start();
            //异步启动
            Task.Run(() =>
            {
                while (httpListener.IsListening)
                {
                    try
                    {
                        var context = httpListener.GetContext();
                        var response = context.Response;
                        //二维码网页
                        string html = $@"
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta charset='utf-8'>
                            <title>DG-LAB SPT 控制面板</title>
                            <script src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'></script>
                            <style>
                                body {{ display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #1a1a1a; color: #fff; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; }}
                                .container {{ text-align: center; background: #2d2d2d; padding: 40px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }}
                                h2 {{ color: #4CAF50; margin-top: 0; }}
                                #qrcode {{ padding: 20px; background: white; border-radius: 10px; display: inline-block; margin: 20px 0; }}
                                .status {{ color: #aaa; font-size: 14px; }}
                            </style>
                        </head>
                        <body>
                            <div class='container'>
                                <h2>SPT-AKI 郊狼连接节点</h2>
                                <p>请使用 <b>DG-LAB 郊狼 App</b> 扫描下方二维码</p>
                                <div id='qrcode'></div>
                                <p class='status'>等待设备连接...<br>连接成功后，控制台将显示提示。</p>
                            </div>
                            <script>
                                // 在浏览器端直接渲染二维码
                                new QRCode(document.getElementById('qrcode'), {{
                                    text: '{qrContent}',
                                    width: 250,
                                    height: 250,
                                    colorDark : '#000000',
                                    colorLight : '#ffffff',
                                    correctLevel : QRCode.CorrectLevel.H
                                }});
                            </script>
                        </body>
                        </html>";

                        byte[] buffer = Encoding.UTF8.GetBytes(html);
                        response.ContentType = "text/html; charset=utf-8";
                        response.ContentLength64 = buffer.Length;
                        response.OutputStream.Write(buffer, 0, buffer.Length);
                        response.OutputStream.Close();
                    }
                    catch (HttpListenerException)
                    {
                        //监听器关闭时会抛出异常, 这里直接忽略即可
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[DG-LAB] HTTP 服务异常: {ex.Message}");
                    }
                }
            });
        }
        //http服务器关闭
        //由于绑定到游戏客户端, 此处无用途, 仅做保留
        public static void OnDestroy()
        {
            if (httpListener != null)
            {
                httpListener.Stop();
                httpListener.Close();
            }
            if (WebSocketManager.wss != null)
            {
                WebSocketManager.wss.Stop();
            }
            Console.WriteLine("[DG-LAB] 服务端已彻底关闭。");
        }
        //获取本地ip
        public static string GetLocalIPAddress()
        {
            var host = Dns.GetHostEntry(Dns.GetHostName());
            foreach (var ip in host.AddressList)
            {
                if (ip.AddressFamily == AddressFamily.InterNetwork)
                {
                    return ip.ToString();
                }
            }
            return "127.0.0.1";
        }
    }
}
