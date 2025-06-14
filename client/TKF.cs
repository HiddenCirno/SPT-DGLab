
using EFT.HealthSystem;
using EFT;
using HarmonyLib;
using System;
using Newtonsoft.Json;
using SPT.Common.Http;
using Comfort.Common;
using UnityEngine;
using EFT.InventoryLogic;
using BepInEx;
using EFT.UI.SessionEnd;
using System.Reflection;
using BepInEx.Configuration;

namespace DGLAB
{



    [BepInPlugin("com.dglab.test", "DGLabTest", "1.0.0")]
    public class LoadPlugin : BaseUnityPlugin
    {
        private void Awake()
        {
            //Logger.LogInfo("MyPlugin is loading...");

            //string string2 = ToolClass.increaseStrength(1, 5);
            var harmony = new Harmony("com.dglab.test");
            harmony.PatchAll();

            ToolClass.onGameLaunch(1, 0);
            ToolClass.onGameLaunch(2, 0);
            HealthStrengthLimit = Config.Bind("设置", "生命损失强度上限", 50, "战局内因生命值损失而增加的累加强度的最大值, 默认为50, 会根据强度上限按比例计算");
            BodyDestoryStrength = Config.Bind("设置", "肢体部位损毁强度", 5, "战局内因肢体损毁而增加/因手术治疗减少的累加强度值, 默认为5, 会根据强度上限按比例计算");
            ExtitStengthCountA = Config.Bind("设置", "A通道撤离强度", 5, "撤离成功/失败后A通道减少/增加的基础强度, 默认为5, 真实数值, 不会按比例减少");
            ExtitStengthCountB = Config.Bind("设置", "B通道撤离强度", 5, "撤离成功/失败后B通道减少/增加的基础强度, 默认为5, 真实数值, 不会按比例减少");
            //Logger.LogInfo("MyPlugin loaded and patches applied.");
        }


        public static ConfigEntry<int> HealthStrengthLimit;
        public static ConfigEntry<int> BodyDestoryStrength;
        public static ConfigEntry<int> ExtitStengthCountA;
        public static ConfigEntry<int> ExtitStengthCountB;


    }

    [HarmonyPatch(typeof(ActiveHealthController), "DestroyBodyPart")]
    public class DestroyBodyPartPatch
    {
        // Postfix: 方法调用后触发
        [HarmonyPostfix]
        public static void Postfix(EBodyPart bodyPart, EDamageType damageType, ActiveHealthController __instance)
        {
            int limit = LoadPlugin.BodyDestoryStrength.Value;
            Console.WriteLine("Patch生效");
            if (__instance == Singleton<GameWorld>.Instance.MainPlayer.ActiveHealthController)
            {
                Console.WriteLine("Instance Checked");
                // 你可以在这里触发任何你需要的行为
                //Logger.LogInfo($"[MOD] MainPlayer's body part destroyed: {bodyPart}, damage: {damage}");
                if (InstanceClass.CurrentStrengthByBodyDestory <= limit * 7) //最多7个部位损毁
                {
                    InstanceClass.CurrentStrengthByBodyDestory += limit;
                    ToolClass.UpdateRealStrength(InstanceClass.CurrentHealth);
                }
                //string string1 = ToolClass.resolveStrength(1, 1, 5);
                // 举例：触发设备反馈、WebSocket 通知等
                //MyCustomHandler.OnBodyPartDestroyed(bodyPart, damage);
            }
        }
    }
    [HarmonyPatch(typeof(ActiveHealthController), "RestoreBodyPart")]
    public class RestoreBodyPartPartPatch
    {
        // Postfix: 方法调用后触发
        [HarmonyPostfix]
        public static void Postfix(EBodyPart bodyPart, float healthPenalty, ActiveHealthController __instance)
        {
            int limit = LoadPlugin.BodyDestoryStrength.Value;
            Console.WriteLine("Patch生效");
            if (__instance == Singleton<GameWorld>.Instance.MainPlayer.ActiveHealthController)
            {
                Console.WriteLine("Instance Checked");
                // 你可以在这里触发任何你需要的行为
                //Logger.LogInfo($"[MOD] MainPlayer's body part destroyed: {bodyPart}, damage: {damage}");
                if (InstanceClass.CurrentStrengthByBodyDestory >= limit)
                {
                    InstanceClass.CurrentStrengthByBodyDestory -= limit;
                    ToolClass.UpdateRealStrength(InstanceClass.CurrentHealth);
                }
                //string string1 = ToolClass.resolveStrength(1, 0, 5);
                // 举例：触发设备反馈、WebSocket 通知等
                //MyCustomHandler.OnBodyPartDestroyed(bodyPart, damage);
            }
        }
    }
    [HarmonyPatch]
    public static class SessionResult_Show_Patch
    {
        // 1. 指定目标方法
        static MethodInfo TargetMethod()
        {
            Type targetType = typeof(SessionResultExitStatus); // 确保你能引用到此类
            return AccessTools.Method(targetType, "Show", new Type[]
            {
            typeof(Profile),
            typeof(GClass1952),
            typeof(ESideType),
            typeof(ExitStatus),
            typeof(TimeSpan),
            typeof(ISession),
            typeof(bool)
            });
        }

        // 2. 你可以选择前缀或后缀（或两者）

        // 前缀：在原方法前执行，如果返回 false 则阻止原方法执行
        static void Prefix(Profile activeProfile, GClass1952 lastPlayerState, ESideType side, ExitStatus exitStatus, TimeSpan raidTime, ISession session, bool isOnline)
        {
            int countA = LoadPlugin.ExtitStengthCountA.Value;
            int countB = LoadPlugin.ExtitStengthCountB.Value;
            Debug.Log($"[Patch] Show() called with ExitStatus: {exitStatus}, Online: {isOnline}");
            if (exitStatus == ExitStatus.Killed || exitStatus == ExitStatus.MissingInAction)
            {
                ToolClass.transBaseStrength(1, countA);
                ToolClass.transBaseStrength(2, countB);
            }
            else
            {
                ToolClass.transBaseStrength(1, -countA);
                ToolClass.transBaseStrength(2, -countB);
            }
            InstanceClass.CurrentStrengthByHealth = 0;
            InstanceClass.CurrentStrengthByBodyDestory = 0;
            ToolClass.UpdateRealStrength(InstanceClass.StartHealth);

        }

        // 或者使用 Postfix：在方法执行后运行
        // static void Postfix(...) { ... }
    }

    [HarmonyPatch(typeof(GClass2033), "OnHealthChanged")]
    public static class GClass2033_OnHealthChanged_Patch
    {
        [HarmonyPostfix]
        public static void Postfix(GClass2033 __instance, EBodyPart bodyPart, float diff, DamageInfoStruct damageInfo)
        {
            //int diffValue = (int)Math.Abs(diff);
            //int realDiffValue = (int)Math.Floor(diffValue / 440.0 * 100);
            if (InstanceClass.gameWorld)
            {
                ActiveHealthController aHCInstance = InstanceClass.gameWorld.MainPlayer.ActiveHealthController;
                ValueStruct bodyHealth = aHCInstance.GetBodyPartHealth(EBodyPart.Common, true);
                int currentHealth = ((int)bodyHealth.Current <= 0) ? 0 : (int)bodyHealth.Current;
                InstanceClass.CurrentHealth = currentHealth;

                ToolClass.UpdateRealStrength(currentHealth);


                /*
                int maxHealth = (int)bodyHealth.Maximum;
                int percentage = (int)((double)currentHealth / maxHealth * 100);
                int currentStrength = 50 - (percentage / 2);
                int realStrength = 0;
                InstanceClass.CurrentStrengthByHealth = currentStrength;
                realStrength =
                Math.Max(0, InstanceClass.CurrentStrengthByHealth) +
                Math.Max(0, InstanceClass.CurrentStrengthByBodyDestory) +
                Math.Max(0, InstanceClass.CurrentStrengthByDeath);
                if(InstanceClass.RealStrength != realStrength)
                {
                    InstanceClass.RealStrength = realStrength;
                    ToolClass.setAddedStrength(1, InstanceClass.RealStrength);
                }
            }
                */
                /*
                if (diff > 4.4f)
                {
                    Console.WriteLine($"[治疗] {bodyPart} 恢复了 {diff:F1} 点生命");
                    ToolClass.resolveStrength(1, 0, realDiffValue > 0 ? realDiffValue : 1);
                }
                else if (diff < -4.4f)
                {
                    Console.WriteLine($"[受伤] {bodyPart} 受到了 {Math.Abs(diff):F1} 点伤害");
                    ToolClass.resolveStrength(1, 1, realDiffValue > 0 ? realDiffValue : 1);
                }
                else
                {
                    Console.WriteLine($"[无变化] {bodyPart} 的生命值未改变");
                }
                */
            }
        }
    }

    [HarmonyPatch(typeof(GameWorld), "OnGameStarted")]
    public class Patch_GameWorld_OnGameStarted
    {
        // Postfix 方法
        [HarmonyPostfix]
        public static void Postfix(GameWorld __instance)
        {
            Debug.Log("[Patch] GameWorld.OnGameStarted Postfix called!");
            InstanceClass.gameWorld = __instance;
            ActiveHealthController aHCInstance = __instance.MainPlayer.ActiveHealthController;
            InstanceClass.MaxHealth = (int)aHCInstance.GetBodyPartHealth(EBodyPart.Common, true).Maximum;
            InstanceClass.StartHealth = (int)aHCInstance.GetBodyPartHealth(EBodyPart.Common, true).Current;

            ToolClass.UpdateRealStrength(InstanceClass.StartHealth);

            // 你自己的逻辑：比如访问游戏世界或初始化内容
            // 示例：获取当前玩家
        }
    }

    public class ToolClass
    {
        public static string resolveStrength(int channel, int mode, int strength)
        {
            return RequestHandler.PostJson("/DGLabs/HandleStrength", JsonConvert.SerializeObject(new Request.ResolveStrength(channel, mode, strength)));
        }
        public static string setAddedStrength(int channel, int strength)
        {
            return RequestHandler.PostJson("/DGLabs/SetAddStrength", JsonConvert.SerializeObject(new Request.IncreaseStrength(channel, strength)));
        }
        public static string onGameLaunch(int channel, int strength)
        {
            return RequestHandler.PostJson("/DGLabs/OnClientLaunch", JsonConvert.SerializeObject(new Request.IncreaseStrength(channel, strength)));
        }
        public static string transBaseStrength(int channel, int strength)
        {
            return RequestHandler.PostJson("/DGLabs/TransBaseStrength", JsonConvert.SerializeObject(new Request.IncreaseStrength(channel, strength)));
        }
        public static string increaseStrength(int channel, int strength)
        {
            return RequestHandler.PostJson("/DGLabs/Test", JsonConvert.SerializeObject(new Request.IncreaseStrength(channel, strength)));
        }
        public static void UpdateRealStrength(int currentHealth)
        {

            //ValueStruct bodyHealth = activeHealthController.GetBodyPartHealth(EBodyPart.Common, true);
            int maxHealth = InstanceClass.MaxHealth;

            currentHealth = Math.Max(0, currentHealth);
            //int percentage = maxHealth > 0 ? (int)((double)currentHealth / maxHealth * 100) : 0;
            double healthPercent = maxHealth > 0 ? (double)currentHealth / maxHealth : 0.0;
            int maxHealthStrength = LoadPlugin.HealthStrengthLimit.Value; // 强度上限
            int currentStrengthByHealth = (int)(maxHealthStrength * (1.0 - healthPercent));
            InstanceClass.CurrentStrengthByHealth = currentStrengthByHealth;

            int realStrength =
                Math.Max(0, InstanceClass.CurrentStrengthByHealth) +
                Math.Max(0, InstanceClass.CurrentStrengthByBodyDestory);

            if (InstanceClass.RealStrength != realStrength)
            {
                InstanceClass.RealStrength = realStrength;
                ToolClass.setAddedStrength(1, InstanceClass.RealStrength);
                ToolClass.setAddedStrength(2, InstanceClass.RealStrength);
            }
        }
    }
    internal static class Request
    {

        public class IncreaseStrength
        {
            public IncreaseStrength(int channel, int strength)
            {
                this.channel = channel;
                this.strength = strength;
            }
            public int channel;
            public int strength;
        }
        public class ResolveStrength
        {
            public ResolveStrength(int channel, int mode, int strength)
            {
                this.channel = channel;
                this.mode = mode;
                this.strength = strength;
            }
            public int channel;
            public int mode;
            public int strength;
        }
    }
    public class InstanceClass
    {
        public static GameWorld gameWorld;
        public static int MaxHealth = 440;
        public static int CurrentHealth = 440;
        public static int StartHealth = 440;
        public static int RealStrength = 0;
        public static int CurrentStrengthByHealth = 0;
        public static int CurrentStrengthByBodyDestory = 0;
        public static int CurrentStrengthByDeath = 0;
        public static int CurrentStrengthBySurvive = 0;
        public static int CurrentBaseStrength = 0;
    }
    public class Info
    {

        public class IncreaseInfo
        {

            public int Channel { get; set; }
            public int Strength { get; set; }
            public IncreaseInfo(int channel, int strength)
            {
                Channel = channel;
                Strength = strength;
            }
        }
        public class StrengthInfo
        {

            public int Channel { get; set; }
            public int Mode { get; set; }
            public int Strength { get; set; }
            public StrengthInfo(int channel, int mode, int strength)
            {
                Channel = channel;
                Mode = mode;
                Strength = strength;
            }
        }

    }
}
