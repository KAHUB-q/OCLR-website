const internalInstructions = [
  /^(?:please\s+)?(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:the\s+)?(?:(?:(?:previous|prior|earlier)\s+)?system\s+(?:instructions|rules|prompts)|(?:previous|prior|earlier)\s+(?:instructions|prompts))\b/i,
  /^(?:please\s+)?(?:show|reveal|print|repeat|paste|give me)\s+(?:me\s+)?(?:your|the)\s+(?:full\s+|original\s+)?(?:system|developer)\s+(?:prompt|instructions)\b/i,
  /^(?:[請请]|[幫帮]我)*(?:忽略|[無无][視视]|覆[寫写]|[忘刪删]掉)(?:所有)?(?:(?:先前|之前|上面|原本)的?(?:指[令示]|提示[詞词])|系[統统]的?(?:指[令示]|[規规][則则]|提示[詞词]))/i,
  /^(?:[請请]|[幫帮]我)*(?:[顯显]示|[貼贴]出|[複复][製制]|公布|透露|[輸输]出|[給给]我)(?:一下)?(?:你的|莉露的)?(?:系[統统]|[開开][發发]者)的?(?:提示[詞词]|指[令示])/i,
];

const seasonTopic =
  /\b(?:oclr|osu|tournaments?|beatmaps?|mappools?|fixtures?|draft picks?|rosters?)\b|本[屆届]|[賽赛]季|比[賽赛]|[賽赛]程|[賽赛]果|[選选]手|[隊队]伍|[選选]秀|[譜谱]面|[圖图]池|[報报]名/i;

const unrelatedRequest = [
  /^(?:please\s+)?(?:write|draft|generate|do|solve)\b.{0,80}\b(?:homework|essay|(?:python|javascript|typescript|bash) (?:code|script|program))\b/i,
  /^(?:please\s+)?(?:tell|show|give)\s+(?:me\s+)?(?:a|one)\s+joke\b/i,
  /^(?:(?:what(?:'s| is) (?:the )?|give me (?:the )?)weather(?: forecast)?\b|weather forecast\b)/i,
  /^(?:[請请]|[幫帮]我|替我)*(?:[寫写]|代[寫写]|[產产]生|生成|完成|做).{0,36}(?:作[業业]|[論论]文|作文|程式|[編编]程|代[碼码]|python|javascript|typescript)/i,
  /^(?:[請请]|[幫帮]我|[給给]我)*(?:[講讲]|[說说])(?:[個个]|一[個个])?笑[話话]/,
  /^.{0,20}(?:天[氣气]|股[價价])(?:[預预][報报]|如何|怎[麼么][樣样]|多少|好[嗎吗])?[?!.。]*$/,
];

export function chatRequestBlockReason(question: string) {
  const normalized = question.normalize("NFKC").trim();
  const compact = normalized.replace(/\s+/gu, "");
  if (/^(.)\1{23,}$/su.test(compact)) return "repetition";
  // An opening greeting should not hide the intent of the rest of the message.
  const request = normalized.replace(
    /^(?:你好|您好|嗨|哈[囉啰]|hi|hello|hey)\s*[,!.。]+\s*/i,
    "",
  );
  if (internalInstructions.some((pattern) => pattern.test(request)))
    return "internal_instructions";
  if (
    !seasonTopic.test(request) &&
    unrelatedRequest.some((pattern) => pattern.test(request))
  )
    return "unrelated_request";
  return null;
}
