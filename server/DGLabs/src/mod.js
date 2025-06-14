"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = __importDefault(require("ws"));
const qrcode_1 = __importDefault(require("qrcode"));
const uuid_1 = require("uuid");
const config_json_1 = __importDefault(require("../config.json"));
class Mod {
    logger;
    expressServer;
    // 成员变量
    connectionId = "";
    targetWSId = "";
    followAStrength = false;
    followBStrength = false;
    wsConn = null;
    clients = new Map();
    // 存储通讯关系
    relations = new Map();
    // 存储客户端和发送计时器关系
    clientTimers = new Map();
    // 心跳定时器
    heartbeatInterval;
    clientid = "";
    deviceid = "";
    maxStrengthA = 100;
    maxStrengthB = 100;
    baseStrengthA = config_json_1.default.channelABaseStrength;
    baseStrengthB = config_json_1.default.channelBBaseStrength;
    currentStrengthA = 0;
    currentStrengthB = 0;
    // 常量配置
    punishmentDuration = 5; // 默认发送时间5秒
    punishmentTime = 1; // 默认一秒发送1次
    // WebSocket 服务器实例
    wss;
    preSptLoad(container) {
        this.logger = container.resolve("WinstonLogger");
        const staticRouterModService = container.resolve("StaticRouterModService");
        this.setupEventListeners();
        this.connectWs();
        staticRouterModService.registerStaticRouter("DGLABSendEvent", [
            {
                url: "/launcher/server/serverModsUsedByProfile",
                action: (url, info, sessionId, output) => {
                    //sentGit(container, sessionId)
                    //console.log(123123123)
                    //console.log(this.clientid)
                    const client = this.clients.get(this.clientid);
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
                        message: `["0A0A0A0A00000000","0A0A0A0A0A0A0A0A","0A0A0A0A14141414","0A0A0A0A1E1E1E1E","0A0A0A0A28282828","0A0A0A0A32323232","0A0A0A0A3C3C3C3C","0A0A0A0A46464646","0A0A0A0A50505050","0A0A0A0A5A5A5A5A","0A0A0A0A64646464"]`,
                        channel: "1", time: 5, type: "msg"
                    };
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
        ], "aki");
        staticRouterModService.registerStaticRouter("DGLabsServerEvent", [
            {
                url: "/DGLabs/Test",
                action: (url, info, sessionId, output) => {
                    //info is the payload from client in json
                    //output is the response back to client
                    //return (JSON.stringify(this.returnItemIDByName(info.name, info.realname)));
                    this.increaseStrength(info.channel, info.strength);
                    return JSON.stringify({ info: "str" });
                }
            },
            {
                url: "/DGLabs/OnClientLaunch",
                action: (url, info, sessionId, output) => {
                    //info is the payload from client in json
                    //output is the response back to client
                    //return (JSON.stringify(this.returnItemIDByName(info.name, info.realname)));
                    this.setAddStrength(info.channel, info.strength);
                    return JSON.stringify({ info: "str" });
                }
            },
            {
                url: "/DGLabs/HandleStrength",
                action: (url, info, sessionId, output) => {
                    //info is the payload from client in json
                    //output is the response back to client
                    //return (JSON.stringify(this.returnItemIDByName(info.name, info.realname)));
                    this.handleStrength(info.channel, info.mode, info.strength);
                    return JSON.stringify({ info: "str" });
                }
            },
            {
                url: "/DGLabs/SetAddStrength",
                action: (url, info, sessionId, output) => {
                    //info is the payload from client in json
                    //output is the response back to client
                    //return (JSON.stringify(this.returnItemIDByName(info.name, info.realname)));
                    this.setAddStrength(info.channel, info.strength);
                    return JSON.stringify({ info: "str" });
                }
            },
            {
                url: "/DGLabs/TransBaseStrength",
                action: (url, info, sessionId, output) => {
                    //info is the payload from client in json
                    //output is the response back to client
                    //return (JSON.stringify(this.returnItemIDByName(info.name, info.realname)));
                    this.transBaseStrength(info.channel, info.strength);
                    return JSON.stringify({ info: "str" });
                }
            }
        ], "custom-dynamic-DGLabsRoutes");
    }
    handleStrength(channel, mode, strength) {
        const maxStrength = channel == 1 ? this.maxStrengthA : this.maxStrengthB;
        const calculateResult = Math.floor((strength / 100) * maxStrength);
        const realStrength = calculateResult == 0 ? 1 : calculateResult;
        this.sendStrengthMessage(channel, mode, realStrength);
    }
    transBaseStrength(channel, strength) {
        console.log("输入基础强度: " + strength);
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
    setAddStrength(channel, strength) {
        console.log("输入强度: " + strength);
        const maxStrength = channel == 1 ? this.maxStrengthA : this.maxStrengthB;
        const currentStrength = channel == 1 ? this.baseStrengthA : this.baseStrengthB;
        const calculateResult = Math.floor((strength / 100) * maxStrength) + currentStrength;
        const realStrength = calculateResult == 0 ? 1 : calculateResult;
        this.sendStrengthMessage(channel, 2, realStrength);
    }
    increaseStrength(channel, strength) {
        this.sendStrengthMessage(channel, 1, strength);
    }
    sendStrengthMessage(channel, mode, strength) {
        const device = this.clients.get(this.deviceid);
        if (device) {
            device.send(JSON.stringify({
                type: "msg",
                clientId: this.clientid,
                targetId: this.deviceid,
                message: `strength-${channel}+${mode}+${strength}`
            }));
        }
    }
    postSptLoad(container) {
        // 
    }
    postDBLoad(container) {
        // 可以在这里添加数据库加载后的逻辑
    }
    setupEventListeners() {
        this.wss = new ws_1.default.Server({ port: config_json_1.default.wsPort });
        this.wss.on('connection', this.handleConnection.bind(this));
    }
    handleConnection(ws) {
        const clientId = (0, uuid_1.v4)();
        console.log('新的 WebSocket 连接已建立，标识符为:', clientId);
        this.clients.set(clientId, ws);
        this.sendBindResponse(ws, clientId);
        ws.on('message', (message) => this.handleMessageServer(message, ws, clientId));
        ws.on('close', () => this.handleClose(clientId));
        ws.on('error', (error) => this.handleError(error, clientId));
        this.startHeartbeat();
    }
    sendBindResponse(ws, clientId) {
        console.log("SendBindingMessage....");
        ws.send(JSON.stringify({
            type: 'bind',
            clientId,
            message: 'targetId',
            targetId: ''
        }));
    }
    handleMessageServer(rawMessage, ws, currentClientId) {
        console.log(`收到来自${currentClientId}的消息：` + rawMessage);
        let data;
        try {
            data = JSON.parse(rawMessage);
        }
        catch (e) {
            ws.send(JSON.stringify({
                type: 'msg',
                clientId: "",
                targetId: "",
                message: '403'
            }));
            console.log('return');
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
            console.log("数据接收成功");
            const numbers = data.message.match(/\d+/g).map(Number);
            if (numbers.length == 4) {
                console.log("数据设置成功");
                this.currentStrengthA = numbers[0];
                this.currentStrengthB = numbers[1];
                this.maxStrengthA = numbers[2];
                this.maxStrengthB = numbers[3];
                console.log("当前A通道强度: " + this.currentStrengthA);
                console.log("当前A通道最大强度: " + this.maxStrengthA);
                console.log("当前B通道强度: " + this.currentStrengthB);
                console.log("当前B通道最大强度: " + this.maxStrengthB);
            }
        }
        // 处理不同类型的消息
        this.processMessage(data, ws);
    }
    isValidSource(data, ws, currentClientId) {
        return (this.clients.get(data.clientId) === ws ||
            this.clients.get(data.targetId) === ws) && data.clientId === currentClientId;
    }
    processMessage(data, ws) {
        const { type, clientId, targetId, message } = data;
        console.log("ServerProcessingMessage....");
        switch (type) {
            case "bind":
                console.log("ServerHandlingBind....");
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
    handleBind(data, ws) {
        const { clientId, targetId } = data;
        this.clientid = clientId;
        this.deviceid = targetId;
        console.log("HandlingBind....");
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
        const targetWs = this.clients.get(targetId);
        const successMsg = JSON.stringify({
            type: "bind",
            clientId,
            targetId,
            message: "200"
        });
        ws.send(successMsg);
        targetWs.send(successMsg);
    }
    isAlreadyBound(clientId, targetId) {
        return Array.from(this.relations.entries()).some(([k, v]) => (k === clientId && v === targetId) ||
            (k === targetId && v === clientId));
    }
    handleStrengthControl(data) {
        const { clientId, targetId, type, channel = 1 } = data;
        const strength = type >= 3 ? data.strength || 1 : 1;
        if (!this.isValidRelation(clientId, targetId)) {
            return;
        }
        const targetWs = this.clients.get(targetId);
        if (!targetWs)
            return;
        const msg = `strength-${channel}+${type - 1}+${strength}`;
        targetWs.send(JSON.stringify({
            type: "msg",
            clientId,
            targetId,
            message: msg
        }));
    }
    handleDirectStrength(data) {
        const { clientId, targetId, message } = data;
        if (!this.isValidRelation(clientId, targetId)) {
            return;
        }
        const targetWs = this.clients.get(targetId);
        if (!targetWs)
            return;
        targetWs.send(JSON.stringify({
            type: "msg",
            clientId,
            targetId,
            message
        }));
    }
    handleWaveformMessage(data, ws) {
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
        if (!targetWs)
            return;
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
                this.delaySendMsg(clientId, ws, targetWs, sendData, totalSends, timeSpace, channel);
            });
        }
        else {
            this.delaySendMsg(clientId, ws, targetWs, sendData, totalSends, timeSpace, channel);
        }
    }
    cancelExistingWaveform(timerKey, targetWs, channel, callback) {
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
    delaySendMsg(clientId, sourceWs, targetWs, sendData, totalSends, timeSpace, channel) {
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
    handleDefaultMessage(data) {
        const { type, clientId, targetId, message } = data;
        console.log('HandleDefault....');
        const targetWs = this.clients.get(targetId);
        if (!targetWs)
            return;
        targetWs.send(JSON.stringify({
            type,
            clientId,
            targetId,
            message
        }));
    }
    isValidRelation(clientId, targetId) {
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
    handleClose(clientId) {
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
    handleError(error, clientId) {
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
    startHeartbeat() {
        if (this.heartbeatInterval)
            return;
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
    startExpressServer(controlId) {
        const app = (0, express_1.default)();
        // 提供二维码生成服务
        app.get('/qrcode', async (req, res) => {
            try {
                const wsUrl = `ws://${config_json_1.default.localIP}:${config_json_1.default.wsPort}/`;
                const qrContent = `https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#${wsUrl}${controlId}`;
                const qrImage = await qrcode_1.default.toDataURL(qrContent);
                res.send(`<img src="${qrImage}" alt="DG-LAB QR Code"/>`);
            }
            catch (error) {
                res.status(500).send('Error generating QR code');
            }
        });
        // 提供绑定状态
        // 启动HTTP服务器
        this.expressServer = app.listen(config_json_1.default.qrCodePort, () => {
            this.logger.info(`[DG-LAB Control] QR code available at http://${config_json_1.default.localIP}:${config_json_1.default.qrCodePort}/qrcode`);
        });
    }
    connectWs() {
        this.wsConn = new ws_1.default(`ws://${config_json_1.default.localIP}:${config_json_1.default.wsPort}/`);
        this.wsConn.onopen = (event) => {
            console.log("WebSocket连接已建立");
        };
        this.wsConn.onmessage = (event) => {
            console.log("RecieveClientMessage....");
            this.handleMessageClient(event);
        };
        this.wsConn.onerror = (event) => {
            console.error("WebSocket连接发生错误");
        };
        this.wsConn.onclose = (event) => {
            this.showToast("连接已断开");
        };
    }
    sendWsMsg(data) {
        if (!this.wsConn || this.wsConn.readyState !== ws_1.default.OPEN)
            return;
        const payload = JSON.stringify({
            type: data.type,
            clientId: this.connectionId,
            targetId: this.targetWSId,
            message: data.message
        });
        this.wsConn.send(payload);
    }
    // 私有方法
    handleMessageClient(event) {
        console.log("HandlingClient....");
        let message;
        try {
            message = JSON.parse(event.data);
        }
        catch (e) {
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
    handleBindMessage(msg) {
        if (!msg.targetId) {
            if (!msg.clientId)
                return;
            this.connectionId = msg.clientId;
            console.log("收到clientId:", msg.clientId);
            this.startExpressServer(msg.clientId);
            //this.qrcodeImg.clear();
            //this.qrcodeImg.makeCode(`https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#ws://12.34.56.78:9999/${this.connectionId}`);
        }
        else {
            if (msg.clientId !== this.connectionId) {
                alert(`收到不正确的target消息: ${msg.message}`);
                return;
            }
            this.targetWSId = msg.targetId;
            console.log("收到targetId:", msg.targetId, "msg:", msg.message);
            this.hideqrcode();
        }
    }
    handleBreakMessage(msg) {
        if (!msg.targetId || msg.targetId !== this.targetWSId)
            return;
        this.showToast(`对方已断开，code: ${msg.message || '未知'}`);
        location.reload();
    }
    handleErrorMessage(msg) {
        if (!msg.targetId || msg.targetId !== this.targetWSId || !msg.message)
            return;
        console.error(msg);
        this.showToast(msg.message);
    }
    handleMsgMessage(msg) {
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
        if (targetWS)
            console.log(`sendingtodevice.....`);
        targetWS.send(JSON.stringify(msg));
    }
    updateChannelValues(numbers) {
        //document.getElementById("channel-a")!.innerText = numbers[0].toString();
        //document.getElementById("channel-b")!.innerText = numbers[1].toString();
        //document.getElementById("soft-a")!.innerText = numbers[2].toString();
        //document.getElementById("soft-b")!.innerText = numbers[3].toString();
    }
    handleSoftLimitFollow(numbers) {
        if (this.followAStrength && numbers[2] !== numbers[0]) {
            this.sendWsMsg({ type: 4, message: `strength-1+2+${numbers[2]}` });
        }
        if (this.followBStrength && numbers[3] !== numbers[1]) {
            this.sendWsMsg({ type: 4, message: `strength-2+2+${numbers[3]}` });
        }
    }
    handleHeartbeat() {
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
    showToast(msg) {
        console.log("Toast:", msg);
        // 实际实现
    }
    hideqrcode() {
        // 实际实现
    }
    showSuccessToast(msg) {
        console.log("Success Toast:", msg);
        // 实际实现
    }
}
module.exports = { mod: new Mod() };
//# sourceMappingURL=mod.js.map