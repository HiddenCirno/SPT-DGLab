using EFT;
using System;
namespace SPTDGLab
{
    public static class StrengthController
    {
        //全局变量保存
        public static GameWorld gameWorld;
        public static int MaxHealth = 440;
        public static int CurrentHealth = 440;
        public static int StartHealth = 440;
        //动态强度计算参数
        public static int CurrentStrengthByHealth = 0;
        public static int DestroyedBodyPartCount = 0;
        //基础强度参数
        public static int BaseStrengthA = 0;
        public static int BaseStrengthB = 0;
        //真实强度
        public static int RealStrengthA = 0;
        public static int RealStrengthB = 0;
        //强度上限
        public static int DeviceMaxA = 100;
        public static int DeviceMaxB = 100;
        //基础强度计算
        /// <summary>
        /// 处理战局结算时的基础强度惩罚 (撤离加减)
        /// </summary>
        public static void TransBaseStrength(int channel, int strengthAmount)
        {
            //取最高避免低于基础强度
            //临时用0, 后面会引入配置项
            if (channel == 1)
            {
                BaseStrengthA = Math.Max(CfgManager.BaseStrengthCountA.Value, BaseStrengthA + strengthAmount);
            }
            else if (channel == 2)
            {
                BaseStrengthB = Math.Max(CfgManager.BaseStrengthCountB.Value, BaseStrengthB + strengthAmount);
            }
            Console.WriteLine($"[DG-LAB] 基础强度更新 - A通道: {BaseStrengthA}, B通道: {BaseStrengthB}");
            //更新真实强度
            UpdateRealStrength(CurrentHealth);
        }
        //强制设置基础强度
        public static void SetBaseStrength(int channel, int value)
        {
            if (channel == 1) BaseStrengthA = value;
            else if (channel == 2) BaseStrengthB = value;

            UpdateRealStrength(CurrentHealth);
        }
        //真实强度计算
        /// <summary>
        /// 核心计算引擎：根据血量、部位损坏和基础惩罚，计算并下发最终强度
        /// </summary>
        public static void UpdateRealStrength(int currentHealth)
        {
            //当前生命值
            CurrentHealth = Math.Max(0, currentHealth);
            //计算损失生命值的比值
            double healthLostPercent = MaxHealth > 0 ? (1.0 - ((double)CurrentHealth / MaxHealth)) : 0.0;
            double virtualHealthPain = CfgManager.HealthStrengthLimit.Value * healthLostPercent;
            //计算肢体损毁的比值
            double virtualBodyPain = CfgManager.BodyDestroyStrength.Value * DestroyedBodyPartCount;
            //总比值
            double totalVirtualPainPercent = virtualHealthPain + virtualBodyPain;
            //核心换算, 比值和设备上限代换得到实际强度
            int dynamicPainA = (int)(DeviceMaxA * (totalVirtualPainPercent / 100.0));
            int dynamicPainB = (int)(DeviceMaxB * (totalVirtualPainPercent / 100.0));
            //实际强度
            int targetStrengthA = Math.Min(200, BaseStrengthA + dynamicPainA);
            int targetStrengthB = Math.Min(200, BaseStrengthB + dynamicPainB);
            //发送指令
            if (RealStrengthA != targetStrengthA)
            {
                RealStrengthA = targetStrengthA;
                PluginsCore.SendStrengthCommand(1, 2, RealStrengthA);
            }

            if (RealStrengthB != targetStrengthB)
            {
                RealStrengthB = targetStrengthB;
                PluginsCore.SendStrengthCommand(2, 2, RealStrengthB);
            }
        }
        /// <summary>
        /// 游戏启动或战局重置时的初始化清理
        /// </summary>
        public static void ResetRealStrength()
        {
            CurrentStrengthByHealth = 0;
            DestroyedBodyPartCount = 0;
            UpdateRealStrength(StartHealth);
        }
    }
}
