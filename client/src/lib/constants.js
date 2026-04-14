export const PAIRS = ["EUR/USD","GBP/USD","USD/JPY","AUD/USD","NZD/USD","USD/CAD","USD/CHF","EUR/GBP","EUR/JPY","GBP/JPY","AUD/JPY","NZD/JPY","CAD/JPY","AUD/CAD","EUR/AUD","USD/CNH","XAU/USD","XAG/USD","USOil","UKOil","NGAS","Copper","BABA.hk"]

export const DIRECTIONS = ["多(Buy)","空(Sell)"]

export const STRATEGIES = ["趋势跟踪","通道突破","回调入场","形态交易","均值回归","基本面驱动","技术+基本面","其他"]

export const TIMEFRAMES = ["M15","M30","H1","H4","D1","W1"]

export const SCORES = ["A-完美执行","B-基本执行","C-有偏差","D-严重违规"]

export const EMOTIONS = ["冷静理性","略有紧张","贪婪冲动","恐惧犹豫","报复心态","过度自信","犹豫不决"]

export const WEEKDAYS = ["周日","周一","周二","周三","周四","周五","周六"]

export const SPREAD_COST = {
  "EUR/USD": 3.5, "GBP/USD": 4, "USD/JPY": 3, "AUD/USD": 3.5,
  "NZD/USD": 4.5, "USD/CAD": 4, "USD/CHF": 4, "EUR/GBP": 4.5,
  "EUR/JPY": 5, "GBP/JPY": 6, "AUD/JPY": 5, "NZD/JPY": 5,
  "CAD/JPY": 5, "AUD/CAD": 4, "EUR/AUD": 5, "USD/CNH": 8,
  "XAU/USD": 12, "XAG/USD": 10, "USOil": 5, "UKOil": 6,
  "NGAS": 8, "Copper": 5, "BABA.hk": 1
}

export const LIVERMORE_QUOTES = [
  { zh: "市场永远不会错，错的是人的看法。", en: "The market is never wrong – opinions often are." },
  { zh: "华尔街没有新鲜事，因为投机如山岳般古老。", en: "There is nothing new in Wall Street. There can't be because speculation is as old as the hills." },
  { zh: "不顾市场条件而频繁交易，是亏损的根源。", en: "The desire for constant action irrespective of underlying conditions is responsible for many losses." },
  { zh: "赚大钱的从来不是靠我的思考，而是靠我的耐心等待。", en: "It was never my thinking that made the big money for me. It always was my sitting." },
  { zh: "一个人必须相信自己和自己的判断，才能在这个行当里谋生。", en: "A man must believe in himself and his judgment if he expects to make a living at this game." },
  { zh: "大行情不是靠读盘读出来的，而是靠耐心等出来的。", en: "Big movements take time to develop. It takes time to make money." },
  { zh: "不要和市场争论，更不要试图战胜它。", en: "Don't argue with the market, and don't try to beat it." },
  { zh: "投机客最大的敌人就是自己——无聊、贪婪和恐惧。", en: "The speculator's chief enemies are always boring from within – greed, fear, and hope." },
  { zh: "先确定正确，再下注。", en: "First be sure you are right, then go ahead." },
  { zh: "只有在你知道不该做什么之后，你才能学会怎么赚钱。", en: "A man must know himself thoroughly if he is going to make a good job out of trading." },
  { zh: "我学到的最有用的东西，是知道什么时候不该做。", en: "The most useful thing I learned was knowing when not to play." },
  { zh: "当我看到危险信号时，我不和它争辩，我远离。", en: "When I see a danger signal, I don't argue with it. I get out." },
  { zh: "钱是靠坐着赚的，不是靠操作赚的。", en: "Money is made by sitting, not trading." },
  { zh: "利润总是能自己照顾自己，亏损却永远不会自己了结。", en: "Profits always take care of themselves, but losses never do." },
  { zh: "不要把所有的鸡蛋放在一个篮子里，但也不要放在太多篮子里。", en: "Put all your eggs in one basket and then watch that basket." },
  { zh: "经验告诉我，除非市场本身确认了你的观点，否则不要相信自己的判断。", en: "Experience has taught me that unless the market itself confirms your opinion, you should not trust your judgment." },
]

export const PHASE_LABELS = {
  entry: '入场',
  exit: '出场',
  both: '通用',
}
