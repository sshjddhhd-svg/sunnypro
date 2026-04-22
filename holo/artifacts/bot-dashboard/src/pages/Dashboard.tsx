import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { 
  useGetBotStatus, 
  getGetBotStatusQueryKey,
  useStartBot,
  useStopBot,
  useUploadAppState,
  useGetBotConfig,
  getGetBotConfigQueryKey,
  useUpdateBotConfig
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Server, Power, PowerOff, UploadCloud, Save, TerminalSquare, Shield, RefreshCw, KeyRound, Eye, EyeOff, Trash2, LogIn, Radio, Send, Users, ChevronRight } from "lucide-react";

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Status Query
  const { data: status, isLoading: isStatusLoading } = useGetBotStatus({
    query: {
      refetchInterval: 5000,
      queryKey: getGetBotStatusQueryKey()
    }
  });

  // Config Query
  const { data: configRes, isLoading: isConfigLoading } = useGetBotConfig({
    query: {
      queryKey: getGetBotConfigQueryKey()
    }
  });
  const config = configRes?.config;

  // Mutations
  const startBot = useStartBot();
  const stopBot = useStopBot();
  const uploadAppState = useUploadAppState();
  const updateBotConfig = useUpdateBotConfig();

  // Form States
  const [appStateInput, setAppStateInput] = useState("");

  // Credentials State
  const [credIdentifier, setCredIdentifier] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [hasSavedCreds, setHasSavedCreds] = useState(false);
  const [savedIdentifier, setSavedIdentifier] = useState("");
  const [isCredLoading, setIsCredLoading] = useState(false);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<{ success: boolean; message: string; cookieCount?: number } | null>(null);

  // Remote Control State
  interface GroupInfo { threadID: string; name: string; memberCount: number; lastActive: number; }
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [selectedGroupIdx, setSelectedGroupIdx] = useState<number | null>(null);
  const [remoteCommand, setRemoteCommand] = useState("");
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  
  // Config Form States
  const [botName, setBotName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [adminIDs, setAdminIDs] = useState("");
  const [autoReconnect, setAutoReconnect] = useState(false);
  const [antiSpam, setAntiSpam] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState(false);

  // Sync config data when loaded
  useEffect(() => {
    if (config) {
      setBotName(config.botName || "");
      setPrefix(config.prefix || "");
      setAdminIDs(config.adminIDs?.join(",") || "");
      setAutoReconnect(config.autoReconnect || false);
      setAntiSpam(config.antiSpam || false);
      setWelcomeMessage(config.welcomeMessage || false);
    }
  }, [config]);

  // Load saved credentials on mount
  useEffect(() => {
    fetch("/api/bot/credentials")
      .then(r => r.json())
      .then(data => {
        if (data.hasCredentials) {
          setHasSavedCreds(true);
          setSavedIdentifier(data.identifier || "");
        }
      })
      .catch(() => {});
  }, []);

  // Handlers
  const handleStartBot = () => {
    startBot.mutate(undefined, {
      onSuccess: (res) => {
        toast({ title: res.success ? "تم بنجاح" : "خطأ", description: res.message, variant: res.success ? "default" : "destructive" });
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "حدث خطأ", description: err.message || "فشل في تشغيل البوت", variant: "destructive" });
      }
    });
  };

  const handleStopBot = () => {
    stopBot.mutate(undefined, {
      onSuccess: (res) => {
        toast({ title: res.success ? "تم بنجاح" : "خطأ", description: res.message, variant: res.success ? "default" : "destructive" });
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "حدث خطأ", description: err.message || "فشل في إيقاف البوت", variant: "destructive" });
      }
    });
  };

  const handleUploadAppState = () => {
    try {
      const parsed = JSON.parse(appStateInput);
      uploadAppState.mutate({ data: { appstate: parsed } }, {
        onSuccess: (res) => {
          toast({ title: res.success ? "تم الرفع بنجاح" : "خطأ", description: res.message, variant: res.success ? "default" : "destructive" });
          if (res.success) setAppStateInput("");
          queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "فشل الرفع", description: err.message || "حدث خطأ غير معروف", variant: "destructive" });
        }
      });
    } catch (e) {
      toast({ title: "JSON غير صالح", description: "الرجاء إدخال AppState صالح بصيغة JSON", variant: "destructive" });
    }
  };

  const handleSaveConfig = () => {
    const adminIDsArray = adminIDs.split(",").map(id => id.trim()).filter(id => id);
    updateBotConfig.mutate({
      data: {
        botName,
        prefix,
        adminIDs: adminIDsArray,
        autoReconnect,
        antiSpam,
        welcomeMessage
      }
    }, {
      onSuccess: (res) => {
        toast({ title: res.success ? "تم الحفظ" : "خطأ", description: res.message || "تم حفظ الإعدادات بنجاح", variant: res.success ? "default" : "destructive" });
        queryClient.invalidateQueries({ queryKey: getGetBotConfigQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "فشل الحفظ", description: err.message || "حدث خطأ غير معروف", variant: "destructive" });
      }
    });
  };

  const handleSaveCredentials = async () => {
    if (!credIdentifier.trim() || !credPassword.trim()) {
      toast({ title: "بيانات ناقصة", description: "أدخل الإيميل/الرقم وكلمة المرور", variant: "destructive" });
      return;
    }
    setIsCredLoading(true);
    try {
      const res = await fetch("/api/bot/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: credIdentifier.trim(), password: credPassword })
      });
      const data = await res.json();
      if (data.success) {
        setHasSavedCreds(true);
        setSavedIdentifier(credIdentifier.trim());
        setCredIdentifier("");
        setCredPassword("");
        toast({ title: "تم الحفظ", description: data.message });
      } else {
        toast({ title: "خطأ", description: data.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", description: "تعذّر الوصول إلى السيرفر", variant: "destructive" });
    } finally {
      setIsCredLoading(false);
    }
  };

  const handleClearCredentials = async () => {
    try {
      await fetch("/api/bot/credentials", { method: "DELETE" });
      setHasSavedCreds(false);
      setSavedIdentifier("");
      toast({ title: "تم المسح", description: "تم حذف بيانات الدخول المحفوظة" });
    } catch {
      toast({ title: "خطأ", description: "تعذّر مسح البيانات", variant: "destructive" });
    }
  };

  const handleManualLogin = async () => {
    setIsLoginLoading(true);
    try {
      const res = await fetch("/api/bot/credentials/login", { method: "POST" });
      const data = await res.json();
      toast({ 
        title: data.success ? "✅ تم تجديد الكوكيز" : "❌ فشل تسجيل الدخول", 
        description: data.message, 
        variant: data.success ? "default" : "destructive" 
      });
      if (data.success) queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
    } catch {
      toast({ title: "خطأ", description: "تعذّر الاتصال بالسيرفر", variant: "destructive" });
    } finally {
      setIsLoginLoading(false);
    }
  };

  const fetchGroups = async () => {
    setIsLoadingGroups(true);
    try {
      const res = await fetch("/api/bot/groups");
      const data = await res.json();
      if (data.success) setGroups(data.groups || []);
    } catch {}
    finally { setIsLoadingGroups(false); }
  };

  useEffect(() => {
    fetchGroups();
    const interval = setInterval(fetchGroups, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSendRemoteCommand = async () => {
    if (selectedGroupIdx === null || !remoteCommand.trim()) {
      toast({ title: "بيانات ناقصة", description: "اختر غروباً وأدخل الأمر", variant: "destructive" });
      return;
    }
    setIsSendingCommand(true);
    try {
      const res = await fetch("/api/bot/groups/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIndex: selectedGroupIdx, command: remoteCommand.trim() })
      });
      const data = await res.json();
      toast({
        title: data.success ? "✅ تم التنفيذ" : "❌ فشل التنفيذ",
        description: data.message,
        variant: data.success ? "default" : "destructive"
      });
      if (data.success) setRemoteCommand("");
    } catch {
      toast({ title: "خطأ في الاتصال", description: "تعذّر الوصول إلى السيرفر", variant: "destructive" });
    } finally {
      setIsSendingCommand(false);
    }
  };

  const handleExtractCookies = async () => {
    if (!hasSavedCreds && (!credIdentifier.trim() || !credPassword.trim())) {
      toast({ title: "بيانات ناقصة", description: "أدخل الإيميل/الرقم وكلمة المرور أولاً", variant: "destructive" });
      return;
    }
    setIsExtracting(true);
    setExtractResult(null);
    try {
      const body: Record<string, string> = {};
      if (credIdentifier.trim()) body.identifier = credIdentifier.trim();
      if (credPassword.trim()) body.password = credPassword;

      const res = await fetch("/api/bot/extract-cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      setExtractResult(data);
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
        toast({ title: "نجح الاستخراج", description: data.message });
      } else {
        toast({ title: "فشل الاستخراج", description: data.message, variant: "destructive" });
      }
    } catch {
      const result = { success: false, message: "تعذّر الاتصال بالسيرفر" };
      setExtractResult(result);
      toast({ title: "خطأ في الشبكة", description: result.message, variant: "destructive" });
    } finally {
      setIsExtracting(false);
    }
  };

  const commands = [
    { cmd: "/help", desc: "قائمة الأوامر" },
    { cmd: "/سيرفر", desc: "معلومات السيرفر" },
    { cmd: "/ping", desc: "اختبار الاستجابة" },
    { cmd: "/وقت", desc: "الوقت الحالي" },
    { cmd: "/اعضاء", desc: "أعضاء المجموعة" },
    { cmd: "/قرعة", desc: "عضو عشوائي" },
    { cmd: "/عداد <رقم>", desc: "عداد تنازلي" },
    { cmd: "/معلومات", desc: "معلومات البوت" },
    { cmd: "/طرد @شخص", desc: "طرد عضو - مشرف" },
    { cmd: "/اضافة <id>", desc: "إضافة عضو - مشرف" },
    { cmd: "/تثبيت <رسالة>", desc: "تثبيت رسالة - مشرف" },
    { cmd: "/ترحيب", desc: "تفعيل الترحيب - مشرف" },
    { cmd: "/اعداد", desc: "عرض الإعدادات - مشرف" },
    { cmd: ".رست", desc: "إعادة تشغيل البوت - مشرف" },
  ];

  const getStatusColor = () => {
    if (!status) return "bg-gray-500";
    if (status.connected) return "bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]";
    if (status.running && !status.connected) return "bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]";
    return "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]";
  };

  const getStatusText = () => {
    if (!status) return "جاري التحميل...";
    if (status.connected) return "متصل";
    if (status.running && !status.connected) return "جاري الاتصال...";
    return "غير متصل";
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans selection:bg-primary/30">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <header className="flex items-center justify-between border-b border-border/50 pb-6 mb-8">
          <div className="flex items-center gap-3">
            <Server className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">لوحة تحكم البوت</h1>
              <p className="text-muted-foreground text-sm mt-1">نظام إدارة وتحكم شامل</p>
            </div>
          </div>
          <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary px-3 py-1 text-sm">
            v1.0.0
          </Badge>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Column 1 */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* BOT STATUS CARD */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <Card className="bg-card border-border/50 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2"><ActivityIcon /> حالة البوت</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">{getStatusText()}</span>
                      <motion.div 
                        className={`w-3 h-3 rounded-full ${getStatusColor()}`}
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                      />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 relative z-10">
                  {status && (
                    <div className="grid grid-cols-2 gap-4 bg-black/20 p-4 rounded-lg border border-white/5">
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground block">معرف الحساب (UserID)</span>
                        <span className="font-mono text-sm font-medium" data-testid="status-userid">
                          {status.userID || "غير متوفر"}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground block">حالة AppState</span>
                        <span className="font-medium text-sm flex items-center gap-1" data-testid="status-appstate">
                          {status.hasAppState ? (
                            <><span className="w-2 h-2 rounded-full bg-green-500"></span> متوفر</>
                          ) : (
                            <><span className="w-2 h-2 rounded-full bg-red-500"></span> غير متوفر</>
                          )}
                        </span>
                      </div>
                      {status.reconnectCount > 0 && (
                        <div className="space-y-1 col-span-2 border-t border-white/5 pt-3 mt-1">
                          <span className="text-xs text-muted-foreground block">محاولات إعادة الاتصال</span>
                          <span className="font-mono text-sm text-yellow-400 font-medium" data-testid="status-reconnects">
                            {status.reconnectCount}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex gap-3 relative z-10">
                  <Button 
                    onClick={handleStartBot} 
                    disabled={startBot.isPending || status?.running}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    data-testid="button-start"
                  >
                    {startBot.isPending ? "جاري التشغيل..." : <><Power className="w-4 h-4 ml-2" /> تشغيل البوت</>}
                  </Button>
                  <Button 
                    onClick={handleStopBot} 
                    disabled={stopBot.isPending || !status?.running}
                    variant="destructive"
                    className="flex-1"
                    data-testid="button-stop"
                  >
                    {stopBot.isPending ? "جاري الإيقاف..." : <><PowerOff className="w-4 h-4 ml-2" /> إيقاف البوت</>}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>

            {/* APPSTATE UPLOAD CARD */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
              <Card className="bg-card border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><UploadCloud className="w-5 h-5 text-primary" /> تحديث AppState</CardTitle>
                  <CardDescription className="text-muted-foreground/80">
                    أدخل مصفوفة ملفات تعريف الارتباط (Cookies) الخاصة بحساب فيسبوك بصيغة JSON.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea 
                    placeholder='[{"key": "c_user", "value": "1000..."}]'
                    className="min-h-[150px] font-mono text-left bg-black/40 border-white/10 resize-none focus-visible:ring-primary/50"
                    dir="ltr"
                    value={appStateInput}
                    onChange={(e) => setAppStateInput(e.target.value)}
                    data-testid="input-appstate"
                  />
                </CardContent>
                <CardFooter>
                  <Button 
                    onClick={handleUploadAppState} 
                    disabled={uploadAppState.isPending || !appStateInput.trim()}
                    className="w-full"
                    data-testid="button-upload-appstate"
                  >
                    {uploadAppState.isPending ? "جاري الرفع..." : <><Save className="w-4 h-4 ml-2" /> حفظ AppState</>}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>

            {/* CREDENTIALS CARD */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
              <Card className="bg-card border-border/50 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none" />
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-violet-400" />
                    بيانات حساب فيسبوك
                  </CardTitle>
                  <CardDescription className="text-muted-foreground/80">
                    يُستخدم لاستخراج الكوكيز تلقائياً عند انتهاء صلاحية الـ AppState.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 relative z-10">
                  {hasSavedCreds && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-violet-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">الحساب المحفوظ</p>
                          <p className="font-mono text-sm font-medium text-violet-300">{savedIdentifier}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={handleClearCredentials}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="credIdentifier" className="text-xs">الإيميل أو رقم الهاتف</Label>
                      <Input id="credIdentifier" type="text" placeholder="example@email.com" value={credIdentifier} onChange={(e) => setCredIdentifier(e.target.value)} className="bg-black/20 border-white/10 h-9 text-sm" dir="ltr" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="credPassword" className="text-xs">كلمة المرور</Label>
                      <div className="relative">
                        <Input id="credPassword" type={showPassword ? "text" : "password"} placeholder="••••••••" value={credPassword} onChange={(e) => setCredPassword(e.target.value)} className="bg-black/20 border-white/10 h-9 text-sm pr-10" dir="ltr" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="relative z-10">
                  <Button onClick={handleSaveCredentials} disabled={isCredLoading || !credIdentifier.trim() || !credPassword.trim()} className="w-full bg-violet-600 hover:bg-violet-700 text-white h-9">
                    {isCredLoading ? "جاري الحفظ..." : <><Save className="w-4 h-4 ml-2" /> حفظ البيانات</>}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>

            {/* COOKIE EXTRACTOR CARD */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.25 }}>
              <Card className="bg-card border-border/50 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-amber-400" />
                    استخراج الكوكيز
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10 mr-auto">
                      c3c fbstate
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-muted-foreground/80">
                    يسجّل دخول الحساب ويستخرج الكوكيز الجديدة ويحفظها مباشرة كـ AppState للبوت.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 relative z-10">
                  {/* Flow Steps */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { step: "١", label: "بيانات الحساب", icon: "🔑" },
                      { step: "٢", label: "تسجيل الدخول", icon: "🌐" },
                      { step: "٣", label: "حفظ الكوكيز", icon: "💾" },
                    ].map((s) => (
                      <div key={s.step} className="p-2 rounded-lg bg-black/20 border border-white/5">
                        <div className="text-xl mb-1">{s.icon}</div>
                        <div className="text-[10px] text-muted-foreground">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Result Box */}
                  {extractResult && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`p-3 rounded-lg border text-sm ${
                        extractResult.success
                          ? "bg-green-500/10 border-green-500/30 text-green-300"
                          : "bg-red-500/10 border-red-500/30 text-red-300"
                      }`}
                    >
                      <p className="font-medium">{extractResult.message}</p>
                      {extractResult.success && extractResult.cookieCount !== undefined && (
                        <p className="text-xs mt-1 opacity-70">عدد الكوكيز المستخرجة: <span className="font-mono font-bold">{extractResult.cookieCount}</span></p>
                      )}
                    </motion.div>
                  )}

                  {!hasSavedCreds && !credIdentifier && (
                    <p className="text-xs text-amber-400/70 text-center">احفظ بيانات الحساب أولاً للاستخراج التلقائي</p>
                  )}
                </CardContent>
                <CardFooter className="relative z-10">
                  <Button
                    onClick={handleExtractCookies}
                    disabled={isExtracting || (!hasSavedCreds && !credIdentifier.trim())}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold h-11 text-base"
                  >
                    {isExtracting ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        جاري استخراج الكوكيز...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-5 h-5" />
                        استخراج الكوكيز الآن
                      </span>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>

          </div>

          {/* Column 2 */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* BOT SETTINGS CARD */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
              <Card className="bg-card border-border/50 h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> إعدادات البوت</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {isConfigLoading ? (
                    <div className="animate-pulse space-y-4">
                      <div className="h-10 bg-white/5 rounded-md"></div>
                      <div className="h-10 bg-white/5 rounded-md"></div>
                      <div className="h-20 bg-white/5 rounded-md"></div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="botName">اسم البوت</Label>
                          <Input 
                            id="botName" 
                            value={botName} 
                            onChange={(e) => setBotName(e.target.value)}
                            className="bg-black/20 border-white/10"
                            data-testid="input-botname"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="prefix">بادئة الأوامر (Prefix)</Label>
                          <Input 
                            id="prefix" 
                            maxLength={5} 
                            value={prefix} 
                            onChange={(e) => setPrefix(e.target.value)}
                            className="bg-black/20 border-white/10 text-center"
                            dir="ltr"
                            data-testid="input-prefix"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="adminIDs">معرفات المشرفين (Admin IDs)</Label>
                        <Textarea 
                          id="adminIDs" 
                          placeholder="1000123..., 1000456..." 
                          value={adminIDs} 
                          onChange={(e) => setAdminIDs(e.target.value)}
                          className="bg-black/20 border-white/10 resize-none font-mono text-left"
                          dir="ltr"
                          data-testid="input-adminids"
                        />
                        <p className="text-xs text-muted-foreground">افصل بين المعرفات بفاصلة (,)</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/5">
                          <Label htmlFor="autoReconnect" className="cursor-pointer">إعادة اتصال تلقائي</Label>
                          <Switch 
                            id="autoReconnect" 
                            checked={autoReconnect} 
                            onCheckedChange={setAutoReconnect}
                            data-testid="switch-autoreconnect"
                          />
                        </div>
                        <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/5">
                          <Label htmlFor="antiSpam" className="cursor-pointer">مكافحة السبام</Label>
                          <Switch 
                            id="antiSpam" 
                            checked={antiSpam} 
                            onCheckedChange={setAntiSpam}
                            data-testid="switch-antispam"
                          />
                        </div>
                        <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/5">
                          <Label htmlFor="welcomeMessage" className="cursor-pointer">رسالة الترحيب</Label>
                          <Switch 
                            id="welcomeMessage" 
                            checked={welcomeMessage} 
                            onCheckedChange={setWelcomeMessage}
                            data-testid="switch-welcomemessage"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
                <CardFooter>
                  <Button 
                    onClick={handleSaveConfig} 
                    disabled={updateBotConfig.isPending || isConfigLoading}
                    className="w-full"
                    data-testid="button-save-config"
                  >
                    {updateBotConfig.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>

          </div>

          {/* COMMANDS REFERENCE CARD - Full width below */}
          <div className="lg:col-span-12">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}>
              <Card className="bg-card border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><TerminalSquare className="w-5 h-5 text-primary" /> دليل الأوامر</CardTitle>
                  <CardDescription>قائمة بجميع الأوامر المتاحة للبوت ووظيفة كل منها.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {commands.map((cmd, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-md bg-black/20 border border-white/5 hover:border-primary/30 transition-colors">
                        <span className="font-medium text-sm">{cmd.desc}</span>
                        <code className="text-primary bg-primary/10 px-2 py-1 rounded text-sm font-mono" dir="ltr">{cmd.cmd}</code>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* REMOTE CONTROL CARD - Full width */}
          <div className="lg:col-span-12">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4 }}>
              <Card className="bg-card border-border/50 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none" />
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Radio className="w-5 h-5 text-cyan-400" />
                      التحكم عن بعد
                      <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
                        {groups.length} غروب
                      </Badge>
                    </CardTitle>
                    <Button size="sm" variant="ghost" onClick={fetchGroups} disabled={isLoadingGroups} className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10">
                      <RefreshCw className={`w-4 h-4 ${isLoadingGroups ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                  <CardDescription>اختر غروباً وأرسل أي أمر إليه مباشرة من لوحة التحكم بدون الحاجة لفتح الماسنجر.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 relative z-10">
                  {groups.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">لا توجد غروبات مسجّلة بعد</p>
                      <p className="text-xs mt-1 opacity-60">سيتم اكتشاف الغروبات تلقائياً عند أول رسالة يتلقاها البوت</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Groups List */}
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">اختر الغروب المستهدف</Label>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {groups.map((g, i) => (
                            <button
                              key={g.threadID}
                              onClick={() => setSelectedGroupIdx(i)}
                              className={`w-full text-right p-3 rounded-lg border transition-all ${
                                selectedGroupIdx === i
                                  ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                                  : "bg-black/20 border-white/5 hover:border-cyan-500/20 hover:bg-cyan-500/5"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${selectedGroupIdx === i ? "bg-cyan-500/20 text-cyan-300" : "bg-white/5 text-muted-foreground"}`}>{i + 1}</span>
                                  <span className="font-medium text-sm truncate">{g.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                                  <span>👥 {g.memberCount}</span>
                                  {selectedGroupIdx === i && <ChevronRight className="w-3 h-3 text-cyan-400" />}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Command Input */}
                      <div className="space-y-3">
                        <Label className="text-xs text-muted-foreground">الأمر المراد تنفيذه</Label>
                        {selectedGroupIdx !== null && (
                          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-sm text-cyan-300 flex items-center gap-2">
                            <ChevronRight className="w-4 h-4" />
                            <span>الغروب المختار: <span className="font-bold">{groups[selectedGroupIdx]?.name}</span></span>
                          </div>
                        )}
                        <Input
                          placeholder=".محرك تشغيل  أو  .الاسم تشغيل اسم جديد"
                          value={remoteCommand}
                          onChange={(e) => setRemoteCommand(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSendRemoteCommand(); }}
                          className="bg-black/20 border-white/10 font-mono text-sm"
                          dir="ltr"
                          disabled={selectedGroupIdx === null}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          {[".محرك تشغيل", ".محرك ايقاف", ".اعضاء", ".الاسم ايقاف", ".كنيتك Holo", ".كنيتك"].map(cmd => (
                            <button
                              key={cmd}
                              onClick={() => setRemoteCommand(cmd)}
                              className="text-left text-xs px-3 py-2 rounded bg-black/20 border border-white/5 hover:border-primary/30 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-all font-mono"
                              dir="ltr"
                            >
                              {cmd}
                            </button>
                          ))}
                        </div>
                        <Button
                          onClick={handleSendRemoteCommand}
                          disabled={isSendingCommand || selectedGroupIdx === null || !remoteCommand.trim()}
                          className="w-full bg-cyan-600 hover:bg-cyan-500 text-white"
                        >
                          {isSendingCommand ? (
                            <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> جاري الإرسال...</span>
                          ) : (
                            <span className="flex items-center gap-2"><Send className="w-4 h-4" /> تنفيذ الأمر في الغروب</span>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

        </div>
      </div>
    </div>
  );
}

function ActivityIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}