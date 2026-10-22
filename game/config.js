// 游戏配置：阵营、关键词、计分权重都在这里改
export const CONFIG = {
  title: '红蓝大战',
  // 每局时长（秒），可用 URL 参数 ?duration=120 覆盖
  duration: 180,
  // 自动循环模式（?auto=1）下，结算画面停留多久再开下一局（秒）
  resultSeconds: 15,

  teams: [
    { key: 'red', name: '红方', color: '#ff4d5e', keywords: ['1', '红', '红方'] },
    { key: 'blue', name: '蓝方', color: '#2f7bff', keywords: ['2', '蓝', '蓝方'] },
  ],

  points: {
    join: 10,            // 加入阵营
    chat: 1,             // 已加入的观众每发一条弹幕
    chatCooldownMs: 1000, // 同一人弹幕计分的最小间隔，防刷屏
    like: 1,             // 每个点赞
    diamond: 1,          // 礼物每 1 抖币（调高则礼物更能左右胜负，调低则更看人数）
  },
};
