// 弹幕来源：dyhub 的 WebSocket 事件流，或本地模拟。
// 两者都产出 dyhub 的标准事件格式（type / user / data），游戏逻辑不区分来源。

/**
 * 连接 dyhub。订阅后 dyhub 会自动打开直播间开始采集。
 * onStatus(status, detail)：connecting | live | error | reconnecting
 */
export function connectDyhub({ url, roomId, onEvent, onStatus }) {
  let ws;
  let closed = false;
  let retry = 0;
  let lastError = '';

  function open() {
    onStatus('connecting');
    lastError = '';
    ws = new WebSocket(`${url}?roomId=${encodeURIComponent(roomId)}&types=chat,gift,like`);
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === '__connected') {
        retry = 0;
        onStatus('live');
      } else if (msg.type === '__error') {
        lastError = String(msg.error).split('\n')[0];
      } else if (!msg.type.startsWith('__')) {
        onEvent(msg);
      }
    };
    ws.onclose = () => {
      if (closed) return;
      const delay = Math.min(30000, 2000 * 2 ** retry++);
      // dyhub 报错后会主动断开，此时显示错误原因而不是笼统的"断开"
      onStatus(lastError ? 'error' : 'reconnecting', `${lastError || '连接断开'}，${delay / 1000} 秒后重试`);
      setTimeout(open, delay);
    };
  }

  open();
  return () => {
    closed = true;
    ws?.close();
  };
}

const MOCK_NAMES = [
  '快乐小狗', '夜猫子', '追风少年', '芒果冰', '小鹿乱撞', '一只咸鱼', '星河', '阿飞',
  '大橘', '奶茶续命', '晚风', '柠檬精', '路人甲', '吃瓜群众', '月半', '豆豆',
  '南风知我意', '摸鱼达人', '小太阳', '不睡觉', '清风徐来', '可乐加冰', '山海', '团子',
];
const MOCK_CHATS = ['冲冲冲', '加油！', '666', '红方必胜', '蓝方稳了', '哈哈哈', '来了来了', '顶'];
const MOCK_GIFTS = [
  { giftName: '小心心', diamondCount: 1 },
  { giftName: '玫瑰', diamondCount: 1 },
  { giftName: '人气票', diamondCount: 1 },
  { giftName: '加油鸭', diamondCount: 15 },
  { giftName: '跑车', diamondCount: 1200 },
];

/** 本地模拟弹幕，用于没有直播间时调试。返回停止函数 */
export function startMock(onEvent, { perSecond = 6 } = {}) {
  let seq = 0;
  const users = MOCK_NAMES.map((nickname, i) => ({ id: `mock-${i}`, nickname }));
  // 每个模拟用户偏向一方，让局面有来有回
  const lean = users.map(() => Math.random());
  let bias = 0.5;

  const timer = setInterval(() => {
    bias = Math.min(0.8, Math.max(0.2, bias + (Math.random() - 0.5) * 0.1));
    const i = Math.floor(Math.random() * users.length);
    const user = users[i];
    const base = { id: `mock-${seq++}`, roomId: 'mock', platform: 'douyin', ts: Date.now(), receivedAt: Date.now(), user };
    const r = Math.random();
    if (r < 0.55) {
      const content = Math.random() < 0.5 ? (lean[i] < bias ? '1' : '2') : pick(MOCK_CHATS);
      onEvent({ ...base, type: 'chat', data: { content } });
    } else if (r < 0.9) {
      onEvent({ ...base, type: 'like', data: { count: 1 + Math.floor(Math.random() * 5) } });
    } else if (r < 0.997) {
      const gift = pick(MOCK_GIFTS.slice(0, 4));
      onEvent({ ...base, type: 'gift', data: { ...gift, giftId: gift.giftName, repeatCount: 1, groupCount: 1 } });
    } else {
      onEvent({ ...base, type: 'gift', data: { ...MOCK_GIFTS[4], giftId: 'car', repeatCount: 1, groupCount: 1 } });
    }
  }, 1000 / perSecond);

  return () => clearInterval(timer);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
