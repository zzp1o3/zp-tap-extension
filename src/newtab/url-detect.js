// URL 判定器：决定按回车时是"直达"还是"用搜索引擎搜该词"。
//
// 规则（来自规格 v1.0）：
//   1. 必须含点"."
//   2. 必须无空格
//   3. 点后首段命中预设 TLD 表
//   4. 不含"@"（防止邮箱误判）
//   5. 若已带协议（http:// / https://）则直接判定为 URL
// 满足即视为"可直达"。

const TLD_SET = new Set([
  // 通用
  "com", "net", "org", "edu", "gov", "info", "biz", "name", "pro",
  // 常见国别/中国相关
  "cn", "com.cn", "org.cn", "gov.cn", "edu.cn", "net.cn", "ac.cn",
  "hk", "tw", "mo",
  // 新顶级域
  "io", "dev", "app", "top", "vip", "xyz", "me", "club", "work", "site",
  "online", "store", "tech", "ai", "cc", "tv", "so",
]);

// 去掉可能的协议与尾部斜杠后取"点后段"参与匹配
function normalize(input) {
  let s = input.trim().toLowerCase();
  if (s.startsWith("https://") || s.startsWith("http://")) {
    s = s.replace(/^https?:\/\//, "");
  }
  // 去掉端口之后的路径，只看 host
  s = s.split("/")[0];
  return s;
}

// 主判定函数
export function isDirectUrl(input) {
  if (!input) return false;
  const s = input.trim().toLowerCase();
  if (!s) return false;
  // 带协议直接通过
  if (s.startsWith("http://") || s.startsWith("https://")) return true;
  // localhost（无点）直接视为直达
  if (s.split(/[/:]/)[0] === "localhost") return true;
  // 无点不可能是 URL
  if (!s.includes(".")) return false;
  // 有空格
  if (/\s/.test(s)) return false;
  // 含 @ 视为邮箱，不当 URL
  if (s.includes("@")) return false;
  const host = normalize(s);
  if (!host) return false;
  // 裸 IP（含内网/回环）直接视为直达
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host)) return true;
  // 取点后最后一段作为 TLD，再尝试倒数两段（处理 com.cn 之类）
  const parts = host.split(".");
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1];
  const lastTwo = parts.slice(-2).join(".");
  if (TLD_SET.has(lastTwo) || TLD_SET.has(last)) {
    return true;
  }
  return false;
}

// 把"直达"输入补全为可跳转的 URL（带协议）
export function toDirectUrl(input) {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) return s;
  return "https://" + s;
}