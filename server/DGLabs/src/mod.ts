// mod.ts
import { DependencyContainer } from "tsyringe";
import express from 'express';
import WebSocket, { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { DialogueHelper } from "@spt/helpers/DialogueHelper";
import { IPostSptLoadMod } from "@spt/models/external/IPostSptLoadMod";
import type { StaticRouterModService } from "@spt/services/mod/staticRouter/StaticRouterModService";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ImageRouter } from "@spt/routers/ImageRouter";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ITraderConfig, UpdateTime } from "@spt/models/spt/config/ITraderConfig";
import { IModLoader } from "@spt/models/spt/mod/IModLoader";
import { PreSptModLoader } from "@spt/loaders/PreSptModLoader";
import { Traders } from "@spt/models/enums/Traders";
import { QuestStatus } from "@spt/models/enums/QuestStatus";
import { MessageType } from "@spt/models/enums/MessageType";
import { HashUtil } from "@spt/utils/HashUtil";
import { NotificationSendHelper } from "@spt/helpers/NotificationSendHelper";
import { NotifierHelper } from "@spt/helpers/NotifierHelper";
import { QuestHelper } from "@spt/helpers/QuestHelper";
import { ImporterUtil } from "@spt/utils/ImporterUtil"
import { BundleLoader } from "@spt/loaders/BundleLoader";
import ModConfig from "../config.json";


// 定义接口和类型

interface WSMessage {
    type: string;
    clientId?: string;
    targetId?: string;
    message?: string;
}

interface WebSocketClient {
    clientId: string;
    ws: WebSocket;
}

interface MessageData {
    type: string | number;
    clientId: string;
    targetId: string;
    message: string;
    channel?: string;
    time?: number;
    strength?: number;
}

class Mod implements IPreSptLoadMod, IPostDBLoadMod {
    private logger: ILogger;
    private expressServer: http.Server;
    // 成员变量
    private connectionId: string = "";
    private targetWSId: string = "";
    private followAStrength: boolean = false;
    private followBStrength: boolean = false;
    private wsConn: WebSocket | null = null;

    private clients = new Map();

    // 存储通讯关系
    private relations: Map<string, string> = new Map();

    // 存储客户端和发送计时器关系
    private clientTimers: Map<string, NodeJS.Timeout> = new Map();

    // 心跳定时器
    private heartbeatInterval?: NodeJS.Timeout;

    private clientid = ""
    private deviceid = ""
    private maxStrengthA = 100
    private maxStrengthB = 100
    private baseStrengthA = ModConfig.channelABaseStrength
    private baseStrengthB = ModConfig.channelBBaseStrength
    private currentStrengthA = 0
    private currentStrengthB = 0

    // 常量配置
    private readonly punishmentDuration = 5; // 默认发送时间5秒
    private readonly punishmentTime = 1;    // 默认一秒发送1次

    // WebSocket 服务器实例
    private wss: WebSocket.Server;


    public preSptLoad(container: DependencyContainer): void {
        this.logger = container.resolve<ILogger>("WinstonLogger");
        const staticRouterModService = container.resolve<StaticRouterModService>("StaticRouterModService");
        this.setupEventListeners()
        this.connectWs()


        staticRouterModService.registerStaticRouter(
            "DGLABSendEvent",
            [
                {
                    url: "/launcher/server/serverModsUsedByProfile",
                    action: (url, info, sessionId, output) => {
                        //sentGit(container, sessionId)

                        //console.log(123123123)
                        //console.log(this.clientid)
                        const client = this.clients.get(this.clientid)
                        //if(client) console.log(3333333)
                        //console.log(this.clients)
                        /*
                        device.send(JSON.stringify({
                            type: "msg",
                            clientId: this.clientid,
                            targetId: this.deviceid,
                            message: 'strength-1+1+5'
                        }));
                        */
                        const wave = {
                            clientId: this.clientid, targetId: this.clientid,
                            message: `["0A0A0A0A00000000","0A0A0A0A0A0A0A0A","0A0A0A0A14141414","0A0A0A0A1E1E1E1E","0A0A0A0A28282828","0A0A0A0A32323232","0A0A0A0A3C3C3C3C","0A0A0A0A46464646","0A0A0A0A50505050","0A0A0A0A5A5A5A5A","0A0A0A0A64646464"]`
                            , channel: "1", time: 5, type: "msg"
                        }
                        //this.handleWaveformMessage(wave, device)
                        //0减1加2设置
                        //1A2B
                        //clear-channel清除
                        //clear没反应....直接设置强度0得了
                        //干, clear是清空波形
                        //this.strengthMsg = 'strength-5+5+20+20'
                        return output;
                    }
                }
            ],
            "aki"
        );
        staticRouterModService.registerStaticRouter(
            "DGLabsServerEvent",
            [
                {
                    url: "/DGLabs/Test",
                    action: (url, info, sessionId, output) => {
                        //info is the payload from client in json
                        //output is the response back to client
                        //return (JSON.stringify(this.returnItemIDByName(info.name, info.realname)));
                        this.increaseStrength(info.channel, info.strength)
                        return JSON.stringify({ info: "str" })
                    }
                },
                {
                    url: "/DGLabs/OnClientLaunch",
                    action: (url, info, sessionId, output) => {
                        //info is the payload from client in json
                        //output is the response back to client
                        //return (JSON.stringify(this.returnItemIDByName(info.name, info.realname)));
                        this.setAddStrength(info.channel, info.strength)
                        return JSON.stringify({ info: "str" })
                    }
                },
                {
                    url: "/DGLabs/HandleStrength",
                    action: (url, info, sessionId, output) => {
                        //info is the payload from client in json
                        //output is the response back to client
                        //return (JSON.stringify(this.returnItemIDByName(info.name, info.realname)));
                        this.handleStrength(info.channel, info.mode, info.strength)
                        return JSON.stringify({ info: "str" })
                    }
                },
                {
                    url: "/DGLabs/SetAddStrength",
                    action: (url, info, sessionId, output) => {
                        //info is the payload from client in json
                        //output is the response back to client
                        //return (JSON.stringify(this.returnItemIDByName(info.name, info.realname)));
                        this.setAddStrength(info.channel, info.strength)
                        return JSON.stringify({ info: "str" })
                    }
                },
                {
                    url: "/DGLabs/TransBaseStrength",
                    action: (url, info, sessionId, output) => {
                        //info is the payload from client in json
                        //output is the response back to client
                        //return (JSON.stringify(this.returnItemIDByName(info.name, info.realname)));
                        this.transBaseStrength(info.channel, info.strength)
                        return JSON.stringify({ info: "str" })
                    }
                }
            ], "custom-dynamic-DGLabsRoutes");




    }

    public handleStrength(channel, mode, strength) {
        const maxStrength = channel == 1 ? this.maxStrengthA : this.maxStrengthB
        const calculateResult = Math.floor((strength / 100) * maxStrength)
        const realStrength = calculateResult == 0 ? 1 : calculateResult
        this.sendStrengthMessage(channel, mode, realStrength)
    }
    public transBaseStrength(channel, strength) {
        console.log("输入基础强度: " + strength)
        //const maxStrength = channel == 1 ? this.maxStrengthA: this.maxStrengthB
        if (channel === 1) {
            if ((this.baseStrengthA + strength) >= 0) {
                this.baseStrengthA += strength;
            }
        }
        else {
            if ((this.baseStrengthB + strength) >= 0) {
                this.baseStrengthB += strength;
            }
        }
        //this.sendStrengthMessage(channel, 2, realStrength)
    }
    public setAddStrength(channel, strength) {
        console.log("输入强度: " + strength)
        const maxStrength = channel == 1 ? this.maxStrengthA : this.maxStrengthB
        const currentStrength = channel == 1 ? this.baseStrengthA : this.baseStrengthB
        const calculateResult = Math.floor((strength / 100) * maxStrength) + currentStrength
        const realStrength = calculateResult == 0 ? 1 : calculateResult
        this.sendStrengthMessage(channel, 2, realStrength)
    }

    public increaseStrength(channel, strength) {
        this.sendStrengthMessage(channel, 1, strength)
    }
    public sendStrengthMessage(channel, mode, strength) {

        const device = this.clients.get(this.deviceid)
        if (device) {
            device.send(JSON.stringify({
                type: "msg",
                clientId: this.clientid,
                targetId: this.deviceid,
                message: `strength-${channel}+${mode}+${strength}`
            }));
        }
    }




    public postSptLoad(container: DependencyContainer): void {
        // 
    }
    public postDBLoad(container: DependencyContainer): void {
        // 可以在这里添加数据库加载后的逻辑
    }

    private setupEventListeners(): void {
        this.wss = new WebSocket.Server({ port: ModConfig.wsPort });
        this.wss.on('connection', this.handleConnection.bind(this));
    }

    private handleConnection(ws: WebSocket): void {
        const clientId = uuidv4();
        console.log('新的 WebSocket 连接已建立，标识符为:', clientId);

        this.clients.set(clientId, ws);
        this.sendBindResponse(ws, clientId);

        ws.on('message', (message: string) => this.handleMessageServer(message, ws, clientId));
        ws.on('close', () => this.handleClose(clientId));
        ws.on('error', (error) => this.handleError(error, clientId));

        this.startHeartbeat();
    }

    private sendBindResponse(ws: WebSocket, clientId: string): void {
        console.log("SendBindingMessage....")
        ws.send(JSON.stringify({
            type: 'bind',
            clientId,
            message: 'targetId',
            targetId: ''
        }));
    }

    private handleMessageServer(rawMessage: string, ws: WebSocket, currentClientId: string): void {
        console.log(`收到来自${currentClientId}的消息：` + rawMessage);
        let data: MessageData;

        try {
            data = JSON.parse(rawMessage);
        } catch (e) {
            ws.send(JSON.stringify({
                type: 'msg',
                clientId: "",
                targetId: "",
                message: '403'
            }));
            console.log('return')
            return;
        }

        // 验证消息来源合法性
        /*
        if (!this.isValidSource(data, ws, currentClientId)) {
            ws.send(JSON.stringify({
                type: 'msg',
                clientId: "",
                targetId: "",
                message: '404'
            }));
            return;
        }
            */


        if (data.message.includes("strength")) {
            console.log("数据接收成功")
            const numbers = data.message.match(/\d+/g).map(Number);
            if (numbers.length == 4) {
                console.log("数据设置成功")
                this.currentStrengthA = numbers[0]
                this.currentStrengthB = numbers[1]
                this.maxStrengthA = numbers[2]
                this.maxStrengthB = numbers[3]
                console.log("当前A通道强度: " + this.currentStrengthA)
                console.log("当前A通道最大强度: " + this.maxStrengthA)
                console.log("当前B通道强度: " + this.currentStrengthB)
                console.log("当前B通道最大强度: " + this.maxStrengthB)
            }
        }


        // 处理不同类型的消息
        this.processMessage(data, ws);
    }

    private isValidSource(data: MessageData, ws: WebSocket, currentClientId: string): boolean {
        return (
            this.clients.get(data.clientId) === ws ||
            this.clients.get(data.targetId) === ws
        ) && data.clientId === currentClientId;
    }

    private processMessage(data: MessageData, ws: WebSocket): void {
        const { type, clientId, targetId, message } = data;

        console.log("ServerProcessingMessage....")
        switch (type) {
            case "bind":
                console.log("ServerHandlingBind....")
                this.handleBind(data, ws);
                break;
            case 1:
            case 2:
            case 3:
                this.handleStrengthControl(data);
                break;
            case 4:
                this.handleDirectStrength(data);
                break;
            case "clientMsg":
                this.handleWaveformMessage(data, ws);
                break;
            default:
                this.handleDefaultMessage(data);
        }
    }

    private handleBind(data: MessageData, ws: WebSocket): void {
        const { clientId, targetId } = data;
        this.clientid = clientId
        this.deviceid = targetId
        console.log("HandlingBind....")
        if (!this.clients.has(clientId)) {
            //console.log("HandlingBind1....")
            ws.send(JSON.stringify({
                type: "bind",
                clientId,
                targetId,
                message: "401"
            }));
            return;
        }

        if (!this.clients.has(targetId)) {
            ws.send(JSON.stringify({
                type: "bind",
                clientId,
                targetId,
                message: "401"
            }));
            return;
        }

        if (this.isAlreadyBound(clientId, targetId)) {
            ws.send(JSON.stringify({
                type: "bind",
                clientId,
                targetId,
                message: "400"
            }));
            return;
        }

        this.relations.set(clientId, targetId);
        this.relations.set(targetId, clientId);
        const targetWs = this.clients.get(targetId)!;

        const successMsg = JSON.stringify({
            type: "bind",
            clientId,
            targetId,
            message: "200"
        });

        ws.send(successMsg);
        targetWs.send(successMsg);
    }

    private isAlreadyBound(clientId: string, targetId: string): boolean {
        return Array.from(this.relations.entries()).some(
            ([k, v]) =>
                (k === clientId && v === targetId) ||
                (k === targetId && v === clientId)
        );
    }

    private handleStrengthControl(data: MessageData): void {
        const { clientId, targetId, type, channel = 1 } = data;
        const strength = type >= 3 ? data.strength || 1 : 1;

        if (!this.isValidRelation(clientId, targetId)) {
            return;
        }

        const targetWs = this.clients.get(targetId);
        if (!targetWs) return;

        const msg = `strength-${channel}+${type - 1}+${strength}`;
        targetWs.send(JSON.stringify({
            type: "msg",
            clientId,
            targetId,
            message: msg
        }));
    }

    private handleDirectStrength(data: MessageData): void {
        const { clientId, targetId, message } = data;

        if (!this.isValidRelation(clientId, targetId)) {
            return;
        }

        const targetWs = this.clients.get(targetId);
        if (!targetWs) return;

        targetWs.send(JSON.stringify({
            type: "msg",
            clientId,
            targetId,
            message
        }));
    }

    private handleWaveformMessage(data: MessageData, ws: WebSocket): void {
        const { clientId, targetId, message, channel, time } = data;

        if (!channel) {
            ws.send(JSON.stringify({
                type: "error",
                clientId,
                targetId,
                message: "406-channel is empty"
            }));
            return;
        }

        if (!this.isValidRelation(clientId, targetId)) {
            return;
        }

        const targetWs = this.clients.get(targetId);
        if (!targetWs) return;

        const sendTime = time || this.punishmentDuration;
        const totalSends = this.punishmentTime * sendTime;
        const timeSpace = 1000 / this.punishmentTime;
        const timerKey = `${clientId}-${channel}`;
        const sendData = JSON.stringify({
            type: "msg",
            clientId,
            targetId,
            message: `pulse-${message}`
        });

        if (this.clientTimers.has(timerKey)) {
            this.cancelExistingWaveform(timerKey, targetWs, channel, () => {
                this.delaySendMsg(
                    clientId,
                    ws,
                    targetWs,
                    sendData,
                    totalSends,
                    timeSpace,
                    channel
                );
            });
        } else {
            this.delaySendMsg(
                clientId,
                ws,
                targetWs,
                sendData,
                totalSends,
                timeSpace,
                channel
            );
        }
    }

    private cancelExistingWaveform(
        timerKey: string,
        targetWs: WebSocket,
        channel: string,
        callback: () => void
    ): void {
        const timer = this.clientTimers.get(timerKey);
        if (timer) {
            clearInterval(timer);
            this.clientTimers.delete(timerKey);
        }

        // 发送清除指令
        const clearMsg = JSON.stringify({
            type: "msg",
            clientId: "",
            targetId: "",
            message: `clear-${channel === 'A' ? 1 : 2}`
        });

        targetWs.send(clearMsg);
        setTimeout(callback, 150);
    }

    private delaySendMsg(
        clientId: string,
        sourceWs: WebSocket,
        targetWs: WebSocket,
        sendData: string,
        totalSends: number,
        timeSpace: number,
        channel: string
    ): void {
        const timerKey = `${clientId}-${channel}`;

        // 立即发送第一条消息
        targetWs.send(sendData);
        let remainingSends = totalSends - 1;

        if (remainingSends > 0) {
            const timer = setInterval(() => {
                targetWs.send(sendData);
                remainingSends--;

                if (remainingSends <= 0) {
                    clearInterval(timer);
                    this.clientTimers.delete(timerKey);
                    sourceWs.send("发送完毕");
                }
            }, timeSpace);

            this.clientTimers.set(timerKey, timer);
        }
    }

    private handleDefaultMessage(data: MessageData): void {
        const { type, clientId, targetId, message } = data;
        console.log('HandleDefault....')


        const targetWs = this.clients.get(targetId);
        if (!targetWs) return;

        targetWs.send(JSON.stringify({
            type,
            clientId,
            targetId,
            message
        }));
    }

    private isValidRelation(clientId: string, targetId: string): boolean {
        if (this.relations.get(clientId) !== targetId) {
            const clientWs = this.clients.get(clientId);
            if (clientWs) {
                clientWs.send(JSON.stringify({
                    type: "bind",
                    clientId,
                    targetId,
                    message: "402"
                }));
            }
            return false;
        }
        return true;
    }

    private handleClose(clientId: string): void {
        console.log(`客户端 ${clientId} 断开连接`);

        // 清除计时器
        for (const [key, timer] of this.clientTimers) {
            if (key.startsWith(`${clientId}-`)) {
                clearInterval(timer);
                this.clientTimers.delete(key);
            }
        }

        // 处理关系断开
        const partnerId = this.relations.get(clientId);
        if (partnerId) {
            const partnerWs = this.clients.get(partnerId);
            if (partnerWs) {
                partnerWs.send(JSON.stringify({
                    type: "break",
                    clientId,
                    targetId: partnerId,
                    message: "209"
                }));
                partnerWs.close();
            }
            this.relations.delete(clientId);
        }

        // 从客户端列表中移除
        this.clients.delete(clientId);
    }

    private handleError(error: Error, clientId: string): void {
        console.error(`客户端 ${clientId} 发生错误:`, error.message);

        const partnerId = this.relations.get(clientId);
        if (partnerId) {
            const partnerWs = this.clients.get(partnerId);
            if (partnerWs) {
                partnerWs.send(JSON.stringify({
                    type: "error",
                    clientId,
                    targetId: partnerId,
                    message: "500"
                }));
            }
        }
    }

    private startHeartbeat(): void {
        if (this.heartbeatInterval) return;

        this.heartbeatInterval = setInterval(() => {
            if (this.clients.size > 0) {
                this.clients.forEach((ws, clientId) => {
                    const targetId = this.relations.get(clientId) || '';
                    ws.send(JSON.stringify({
                        type: "heartbeat",
                        clientId,
                        targetId,
                        message: "200"
                    }));
                });
            }
        }, 60000); // 每分钟一次
    }



    private startExpressServer(controlId): void {
        const app = express();

        // 提供二维码生成服务
        app.get('/qrcode', async (req, res) => {
            try {
                const wsUrl = `ws://${ModConfig.localIP}:${ModConfig.wsPort}/`;
                const qrContent = `https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#${wsUrl}${controlId}`;

                const qrImage = await QRCode.toDataURL(qrContent);
                res.send(`<img src="${qrImage}" alt="DG-LAB QR Code"/>`);
            } catch (error) {
                res.status(500).send('Error generating QR code');
            }
        });

        // 提供绑定状态

        // 启动HTTP服务器
        this.expressServer = app.listen(ModConfig.qrCodePort, () => {
            this.logger.info(`[DG-LAB Control] QR code available at http://${ModConfig.localIP}:${ModConfig.qrCodePort}/qrcode`);
        });
    }


    public connectWs(): void {
        this.wsConn = new WebSocket(`ws://${ModConfig.localIP}:${ModConfig.wsPort}/`);

        this.wsConn.onopen = (event: Event) => {
            console.log("WebSocket连接已建立");
        };

        this.wsConn.onmessage = (event: MessageEvent) => {
            console.log("RecieveClientMessage....")
            this.handleMessageClient(event);
        };

        this.wsConn.onerror = (event: Event) => {
            console.error("WebSocket连接发生错误");
        };

        this.wsConn.onclose = (event: CloseEvent) => {
            this.showToast("连接已断开");
        };
    }

    public sendWsMsg(data: { type: number; message: string }): void {
        if (!this.wsConn || this.wsConn.readyState !== WebSocket.OPEN) return;

        const payload = JSON.stringify({
            type: data.type,
            clientId: this.connectionId,
            targetId: this.targetWSId,
            message: data.message
        });
        this.wsConn.send(payload);
    }

    // 私有方法
    private handleMessageClient(event: MessageEvent): void {
        console.log("HandlingClient....")
        let message: WSMessage;
        try {
            message = JSON.parse(event.data as string) as WSMessage;
        } catch (e) {
            console.log("Received non-JSON message:", event.data);
            return;
        }

        switch (message.type) {
            case 'bind':
                this.handleBindMessage(message);
                break;
            case 'break':
                this.handleBreakMessage(message);
                break;
            case 'error':
                this.handleErrorMessage(message);
                break;
            case 'msg':
                this.handleMsgMessage(message);
                break;
            case 'heartbeat':
                this.handleHeartbeat();
                break;
            default:
                console.log("收到其他消息:", JSON.stringify(message));
                break;
        }
    }

    private handleBindMessage(msg: WSMessage): void {
        if (!msg.targetId) {
            if (!msg.clientId) return;
            this.connectionId = msg.clientId;
            console.log("收到clientId:", msg.clientId);
            this.startExpressServer(msg.clientId)
            //this.qrcodeImg.clear();
            //this.qrcodeImg.makeCode(`https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#ws://12.34.56.78:9999/${this.connectionId}`);
        } else {
            if (msg.clientId !== this.connectionId) {
                alert(`收到不正确的target消息: ${msg.message}`);
                return;
            }
            this.targetWSId = msg.targetId;
            console.log("收到targetId:", msg.targetId, "msg:", msg.message);
            this.hideqrcode();
        }
    }

    private handleBreakMessage(msg: WSMessage): void {
        if (!msg.targetId || msg.targetId !== this.targetWSId) return;
        this.showToast(`对方已断开，code: ${msg.message || '未知'}`);
        location.reload();
    }

    private handleErrorMessage(msg: WSMessage): void {
        if (!msg.targetId || msg.targetId !== this.targetWSId || !msg.message) return;
        console.error(msg);
        this.showToast(msg.message);
    }

    private handleMsgMessage(msg: WSMessage): void {
        /*
        if (!msg.message || !msg.targetId) return;

        if (msg.message.includes("strength")) {
            const numbers = msg.message.match(/\d+/g)?.map(Number) || [];
            if (numbers.length >= 4) {
                this.updateChannelValues(numbers);
                this.handleSoftLimitFollow(numbers);
            }
        }
            */
        const targetWS = this.clients.get(msg.targetId);
        if (targetWS) console.log(`sendingtodevice.....`)
        targetWS.send(JSON.stringify(msg))
    }

    private updateChannelValues(numbers: number[]): void {
        //document.getElementById("channel-a")!.innerText = numbers[0].toString();
        //document.getElementById("channel-b")!.innerText = numbers[1].toString();
        //document.getElementById("soft-a")!.innerText = numbers[2].toString();
        //document.getElementById("soft-b")!.innerText = numbers[3].toString();
    }

    private handleSoftLimitFollow(numbers: number[]): void {
        if (this.followAStrength && numbers[2] !== numbers[0]) {
            this.sendWsMsg({ type: 4, message: `strength-1+2+${numbers[2]}` });
        }
        if (this.followBStrength && numbers[3] !== numbers[1]) {
            this.sendWsMsg({ type: 4, message: `strength-2+2+${numbers[3]}` });
        }
    }

    private handleHeartbeat(): void {
        console.log("收到心跳");
        //if (!this.targetWSId) return;

        //const light = document.getElementById("status-light");
        //if (!light) return;

        //light.style.color = '#00ff37';
        setTimeout(() => {
            //light.style.color = '#ffe99d';
        }, 1000);
    }

    // UI 方法（实际应该抽离到单独的UI服务中）
    private showToast(msg: string): void {
        console.log("Toast:", msg);
        // 实际实现
    }

    private hideqrcode(): void {
        // 实际实现
    }

    private showSuccessToast(msg: string): void {
        console.log("Success Toast:", msg);
        // 实际实现
    }

}

module.exports = { mod: new Mod() }