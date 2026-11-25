package rules

// Current 是唯一的交易策略。
//
// 改规则或清单时，在 Versions 末尾追加新版本，不要修改已有版本：
// 已写入数据库的版本与这里不一致时程序会拒绝启动。新版本的样本从零开始统计。
var Current = Definition{
	Name:     "Vegas 顺势",
	Versions: []Version{version1},
}

var version1 = Version{
	No: 1,
	Rules: `看到一个K线图，应该要做什么呢

首先，打开一个K线，永远先判断的是背景，背景决定你做什么，是多还是空；
背景如何判断呢？目前我的做法是看 1小时的Vegas，顺着1小时vegas的方向，并且画出趋势线和通道线，很关键，对于回调的参考，不然你入场的位置很难把握，只有在明确的阻力位和明确的入场信号K才有可观的概率；
Attention：有两个重要地方需要空仓：
1.如果K线不断穿越 vegas，这个时候不要做，耐心等待突破，等待某一方掌控局面；
2.如果刚刚有一波大的跌破，这个时候容易超卖，入场做空容易被埋，耐心等待回调（最好是等待回调到主要高点MH）；

然后是setup；
我的入场一般分为突破前高入场和等回调入场；
突破入场一定得看趋势的强弱和回调的深度；
突破入场只适合趋势明确，前一波或者这一波回调较小的时候，超过20根K线之后要考虑有回调，还有触碰阻力位的反应，如果反弹很大，可能还会继续回调；
回调入场最好要等回调到明确的阻力位（主要高点或主要低点）；等待高二和低二的机会，而且信号K线要比较好才入；
使用stop order入场！

止损设在主要高点之上一点或者主要低点之下一点，如果趋势很强，入场很远，就设为 1/2 处；

使用Vegas参考很容易吃到大头，采用移动止损最好，还可以采用measured move测量止盈，或者分仓；

关于心态：止损和入场，止盈都是入场前要做好的事，这单的亏损要是接受不了，那就不要做了，在K线跳动时就不要操作了。耐心等待止盈或者止损，相信趋势的力量！

要画的线：vegas均线组，通道线，趋势线，主要高点（或主要低点），回调的幅度指示`,
	// 规则原文按主题分组，便于阅读；措辞取自原文。
	Guide: []GuideSection{
		{Title: "背景：先定做多还是做空", Points: []string{
			"打开一个 K 线，永远先判断背景，背景决定做多还是做空",
			"看 1 小时 Vegas，顺着 1 小时 Vegas 的方向",
			"画出趋势线和通道线，作为回调的参考，否则入场位置很难把握",
			"只有在明确的阻力位和明确的入场信号 K，才有可观的概率",
		}},
		{Title: "这两种情况空仓", Tone: "warn", Points: []string{
			"K 线不断穿越 Vegas：不要做，耐心等待突破，等某一方掌控局面",
			"刚刚有一波大的跌破：容易超卖，入场做空容易被埋，耐心等待回调（最好回调到主要高点 MH）",
		}},
		{Title: "Setup · 突破前高", Points: []string{
			"一定要看趋势的强弱和回调的深度",
			"只适合趋势明确，前一波或这一波回调较小的时候",
			"超过 20 根 K 线之后要考虑有回调",
			"注意触碰阻力位的反应，如果反弹很大，可能还会继续回调",
		}},
		{Title: "Setup · 回调入场", Points: []string{
			"最好等回调到明确的阻力位（主要高点或主要低点）",
			"等待高二和低二的机会",
			"信号 K 线要比较好才入",
		}},
		{Title: "入场", Points: []string{"使用 stop order 入场"}},
		{Title: "止损", Points: []string{
			"设在主要高点之上一点，或主要低点之下一点",
			"趋势很强、入场很远时，设在 1/2 处",
		}},
		{Title: "出场", Points: []string{
			"参考 Vegas 很容易吃到大头，采用移动止损最好",
			"也可以用 measured move 测量止盈，或者分仓",
		}},
		{Title: "心态", Points: []string{
			"止损、入场、止盈都是入场前要做好的事",
			"这单的亏损要是接受不了，那就不要做",
			"K 线跳动时不要操作，耐心等待止盈或止损，相信趋势的力量",
		}},
		{Title: "要画的线", Points: []string{"Vegas 均线组", "通道线", "趋势线", "主要高点（或主要低点）", "回调的幅度指示"}},
	},
	Items: []Item{
		{Key: "no_chop", Section: "背景", Label: "K 线没有反复穿越 Vegas，已有一方掌控局面", Kind: Rule},
		{Key: "after_climax", Section: "背景", Label: "刚有一波大的突破或跌破，还没回调（高潮行情反弹会很远）", Kind: Attention},
		{Key: "lines_drawn", Section: "画线", Label: "已画 Vegas、趋势线、通道线、主要高点或主要低点", Kind: Rule},
		{Key: "bo_trend_clear", Section: "突破", Label: "趋势明确，前一波或这一波回调较小", Kind: Rule, Setup: Breakout},
		{Key: "bo_bars_ok", Section: "突破", Label: "没超过约 20 根 K 线，或已考虑回调和阻力位的反应", Kind: Rule, Setup: Breakout},
		{Key: "pb_key_level", Section: "回调", Label: "回调到明确的阻力位（主要高点或主要低点）", Kind: Rule, Setup: Pullback},
		{Key: "pb_second_entry", Section: "回调", Label: "是高二或低二", Kind: Rule, Setup: Pullback},
		{Key: "pb_signal_bar", Section: "回调", Label: "信号 K 线较好", Kind: Rule, Setup: Pullback},
		{Key: "stop_order", Section: "入场", Label: "用 stop order 入场", Kind: Rule},
		{Key: "stop_placed", Section: "止损", Label: "止损在主要高点之上或主要低点之下一点；趋势很强、入场很远时设在 1/2 处", Kind: Rule},
		{Key: "accept_loss", Section: "心态", Label: "这笔亏损我能接受", Kind: Rule},
	},
	Deviations: []Deviation{
		{Key: "moved_stop", Label: "持仓中手动改了止损（计划内的移动止损不算）"},
		{Key: "early_exit", Label: "提前离场（没到止损、目标，也不是计划内的移动止损出场）"},
		{Key: "unplanned_add", Label: "加仓或其他计划外操作"},
	},
}
