using EFT;
using EFT.HealthSystem;
using EFT.UI.SessionEnd;
using HarmonyLib;
using System;
using Comfort.Common;
using System.Reflection;

namespace SPTDGLab
{
    //Patch注入控制逻辑
    internal class GamePatch
    {
        //监听肢体损毁和恢复
        [HarmonyPatch(typeof(ActiveHealthController), "DestroyBodyPart")]
        public class DestroyBodyPartPatch
        {
            [HarmonyPostfix]
            public static void Postfix(EBodyPart bodyPart, EDamageType damageType, ActiveHealthController __instance)
            {
                int limit = CfgManager.BodyDestroyStrength.Value;
                if (__instance == Singleton<GameWorld>.Instance.MainPlayer.ActiveHealthController)
                {
                    //最多只有7个部位损毁
                    if (StrengthController.DestroyedBodyPartCount < 7) 
                    {
                        StrengthController.DestroyedBodyPartCount ++;
                        StrengthController.UpdateRealStrength(StrengthController.CurrentHealth);
                    }
                }
            }
        }
        //监听肢体恢复, 计算逻辑取反, 其余相同
        [HarmonyPatch(typeof(ActiveHealthController), "RestoreBodyPart")]
        public class RestoreBodyPartPartPatch
        {
            [HarmonyPostfix]
            public static void Postfix(EBodyPart bodyPart, float healthPenalty, ActiveHealthController __instance)
            {
                int limit = CfgManager.BodyDestroyStrength.Value;
                if (__instance == Singleton<GameWorld>.Instance.MainPlayer.ActiveHealthController)
                {
                    if (StrengthController.DestroyedBodyPartCount > 0)
                    {
                        StrengthController.DestroyedBodyPartCount --;
                        StrengthController.UpdateRealStrength(StrengthController.CurrentHealth);
                    }
                }
            }
        }
        //撤离状态监听和计算
        [HarmonyPatch]
        public static class SessionResult_Show_Patch
        {
            //由于存在重写, 使用完整参数定位方法
            static MethodInfo TargetMethod()
            {
                Type targetType = typeof(SessionResultExitStatus);
                return AccessTools.Method(targetType, "Show", new Type[]
                {
            typeof(Profile),
            typeof(EFT.PlayerVisualRepresentation),
            typeof(ESideType),
            typeof(ExitStatus),
            typeof(TimeSpan),
            typeof(EFT.IEftSession),
            typeof(bool)
                });
            }
            static void Prefix(Profile activeProfile, EFT.PlayerVisualRepresentation lastPlayerState, ESideType side, ExitStatus exitStatus, TimeSpan raidTime, EFT.IEftSession session, bool isOnline)
            {
                int countA = CfgManager.ExitStengthCountA.Value;
                int countB = CfgManager.ExitStengthCountB.Value;
                //根据撤离状态决定增减基础强度
                if (exitStatus == ExitStatus.Killed || exitStatus == ExitStatus.MissingInAction || exitStatus == ExitStatus.Left)
                {
                    StrengthController.TransBaseStrength(1, countA);
                    StrengthController.TransBaseStrength(2, countB);
                }
                else
                {
                    StrengthController.TransBaseStrength(1, -countA);
                    StrengthController.TransBaseStrength(2, -countB);
                }
                //清除累加强度
                StrengthController.ResetRealStrength();
            }
        }
        //监听生命变化
        [HarmonyPatch(typeof(EFT.HealthStatisticsManager), "OnHealthChanged")]
        public static class HealthStatisticsManager_OnHealthChanged_Patch
        {
            [HarmonyPostfix]
            public static void Postfix(EFT.HealthStatisticsManager __instance, EBodyPart bodyPart, float diff, EFT.Ballistics.DamageInfo damageInfo)
            {
                if (StrengthController.gameWorld)
                {
                    ActiveHealthController aHCInstance = StrengthController.gameWorld.MainPlayer.ActiveHealthController;
                    ValueStruct bodyHealth = aHCInstance.GetBodyPartHealth(EBodyPart.Common, true);
                    //传递当前实时生命值
                    int currentHealth = ((int)bodyHealth.Current <= 0) ? 0 : (int)bodyHealth.Current;
                    StrengthController.CurrentHealth = currentHealth;
                    StrengthController.UpdateRealStrength(currentHealth);
                }
            }
        }
        //游戏开始
        [HarmonyPatch(typeof(GameWorld), "OnGameStarted")]
        public class Patch_GameWorld_OnGameStarted
        {
            // Postfix 方法
            [HarmonyPostfix]
            public static void Postfix(GameWorld __instance)
            {
                //传递引用
                StrengthController.gameWorld = __instance;
                ActiveHealthController aHCInstance = __instance.MainPlayer.ActiveHealthController;
                //传递生命值
                StrengthController.MaxHealth = (int)aHCInstance.GetBodyPartHealth(EBodyPart.Common, true).Maximum;
                StrengthController.StartHealth = (int)aHCInstance.GetBodyPartHealth(EBodyPart.Common, true).Current;
                //进入游戏后更新一次累加强度
                StrengthController.UpdateRealStrength(StrengthController.StartHealth);
            }
        }
    }
}
