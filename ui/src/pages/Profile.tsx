import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/components/theme-provider";
import { Link } from "react-router-dom";
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  Shield, 
  KeyRound, 
  TrendingUp, 
  Award, 
  Wallet, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  RefreshCw,
  Layers,
  Sun,
  Moon,
  LogOut,
  Eye,
  EyeOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface UserProfileData {
  id: string;
  firstName: string;
  secondName: string;
  username: string;
  phoneNumber?: string;
  email: string;
  role: string;
  balance: string;
  createdAt: string;
  hasPassword?: boolean;
}

interface UserStats {
  totalTrades: number;
  wonTrades: number;
  lostTrades: number;
  openTrades: number;
  winRate: number;
  totalStakeUSD: string;
  totalDepositedUSD: string;
}

export default function Profile() {
  const { user, token, updateUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Security Form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);

  // Auto-dismiss banners after 4 seconds
  useEffect(() => {
    if (profileSuccess) {
      const timer = setTimeout(() => setProfileSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [profileSuccess]);

  useEffect(() => {
    if (passSuccess) {
      const timer = setTimeout(() => setPassSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [passSuccess]);

  const fetchProfile = async () => {
    if (!token) return;
    setLoading(true);
    setProfileError(null);
    try {
      const res = await apiFetch("/api/user/profile");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load profile");
      }
      setProfile(data.profile);
      setStats(data.stats);
      setFirstName(data.profile.firstName || "");
      setSecondName(data.profile.secondName || "");
      setUsername(data.profile.username || "");
      setPhoneNumber(data.profile.phoneNumber || "");
    } catch (err: any) {
      setProfileError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [token]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(null);
    setProfileError(null);

    if (username.trim().length < 3) {
      setProfileError("Username must be at least 3 characters");
      return;
    }

    setIsSavingProfile(true);

    try {
      const res = await apiFetch("/api/user/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          secondName: secondName.trim(),
          username: username.trim(),
          phoneNumber: phoneNumber.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile");
      }

      setProfile(data.user);
      updateUser({
        username: data.user.username,
        firstName: data.user.firstName,
        secondName: data.user.secondName,
        phoneNumber: data.user.phoneNumber,
      });
      setProfileSuccess("Profile details updated successfully");
    } catch (err: any) {
      setProfileError(err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassSuccess(null);
    setPassError(null);

    if (profile?.hasPassword && !currentPassword) {
      setPassError("Current password is required");
      return;
    }

    if (newPassword.length < 8) {
      setPassError("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError("Passwords do not match");
      return;
    }

    setIsChangingPass(true);
    try {
      const res = await apiFetch("/api/user/change-password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: currentPassword || undefined,
          newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update password");
      }

      setPassSuccess("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Update hasPassword state locally
      if (profile) {
        setProfile({ ...profile, hasPassword: true });
      }
    } catch (err: any) {
      setPassError(err.message);
    } finally {
      setIsChangingPass(false);
    }
  };

  const initials = (profile?.firstName?.[0] || user?.username?.[0] || "U").toUpperCase() +
    (profile?.secondName?.[0] || "").toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="border-b bg-card px-3 sm:px-8 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link 
            to="/" 
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Back to trading"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <img src="/branding/logo-mark.svg" alt="Global Link" className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg shadow-sm" />
          <div>
            <h1 className="font-bold text-sm sm:text-base flex items-center gap-1.5">
              <User className="h-4 w-4 text-primary" /> Profile & Settings
            </h1>
            <p className="text-[11px] text-muted-foreground hidden sm:block">Account identity, trading stats, and security</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchProfile} 
            disabled={loading} 
            className="gap-1.5 h-8 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Link to="/">
            <Button size="sm" className="bg-primary text-primary-foreground h-8 text-xs px-3">
              Trade Platform
            </Button>
          </Link>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 gap-1"
            onClick={logout}
            title="Log out"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Profile Card Header */}
        <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center gap-6 justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>

          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-white font-extrabold text-2xl flex items-center justify-center shadow-md shrink-0">
              {initials}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h2 className="text-2xl font-bold">
                  {profile?.firstName ? `${profile.firstName} ${profile.secondName}` : profile?.username || user?.username}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/15 text-primary border border-primary/20">
                  {profile?.role || "TRADER"}
                </span>
              </div>
              <p className="text-muted-foreground text-sm flex items-center justify-center sm:justify-start gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {profile?.email || user?.email}
              </p>
              {profile?.createdAt && (
                <p className="text-xs text-muted-foreground">
                  Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-center justify-center">
            <div className="bg-muted/40 border rounded-xl p-3 text-center min-w-[120px]">
              <div className="text-xs text-muted-foreground">Wallet Balance</div>
              <div className="text-base font-bold text-emerald-500">
                {loading ? "..." : `$${profile?.balance ? parseFloat(profile.balance).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "0.00"}`}
              </div>
            </div>
            <div className="bg-muted/40 border rounded-xl p-3 text-center min-w-[120px]">
              <div className="text-xs text-muted-foreground">Win Rate</div>
              <div className="text-base font-bold text-cyan-500">
                {loading ? "..." : `${stats?.winRate ?? 0}%`}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card border rounded-xl p-4 flex flex-col gap-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-blue-500" /> Total Trades
            </div>
            <div className="text-xl font-bold">{loading ? "..." : stats?.totalTrades ?? 0}</div>
            <div className="text-[11px] text-muted-foreground">Active: {stats?.openTrades ?? 0}</div>
          </div>

          <div className="bg-card border rounded-xl p-4 flex flex-col gap-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Award className="h-3.5 w-3.5 text-emerald-500" /> Won Trades
            </div>
            <div className="text-xl font-bold text-emerald-500">{loading ? "..." : stats?.wonTrades ?? 0}</div>
            <div className="text-[11px] text-muted-foreground">Losses: {stats?.lostTrades ?? 0}</div>
          </div>

          <div className="bg-card border rounded-xl p-4 flex flex-col gap-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-purple-500" /> Total Volume
            </div>
            <div className="text-xl font-bold">{loading ? "..." : `$${stats?.totalStakeUSD ?? "0.00"}`}</div>
            <div className="text-[11px] text-muted-foreground">USD cumulative</div>
          </div>

          <div className="bg-card border rounded-xl p-4 flex flex-col gap-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-amber-500" /> Total Deposited
            </div>
            <div className="text-xl font-bold text-amber-500">{loading ? "..." : `$${stats?.totalDepositedUSD ?? "0.00"}`}</div>
            <div className="text-[11px] text-muted-foreground">USD via M-Pesa</div>
          </div>
        </div>

        {/* Forms Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Edit Profile Form */}
          <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b pb-3">
                <User className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-base">Personal Details</h3>
              </div>

              {profileSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> {profileSuccess}
                </div>
              )}
              {profileError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {profileError}
                </div>
              )}

              <form id="profile-form" onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">First Name</label>
                    <input
                      type="text"
                      className="w-full p-2.5 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Last Name</label>
                    <input
                      type="text"
                      className="w-full p-2.5 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      value={secondName}
                      onChange={(e) => setSecondName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Username</label>
                  <input
                    type="text"
                    minLength={3}
                    className="w-full p-2.5 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">M-Pesa Phone Number</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                      <Phone className="h-4 w-4" />
                    </div>
                    <input
                      type="tel"
                      className="w-full pl-10 p-2.5 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="07XXXXXXXX or 254XXXXXXXX"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Email Address (Immutable)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      type="email"
                      className="w-full pl-10 p-2.5 bg-muted/50 border rounded-lg text-sm text-muted-foreground cursor-not-allowed"
                      value={profile?.email || user?.email || ""}
                      disabled
                    />
                  </div>
                </div>
              </form>
            </div>

            <div className="mt-6 pt-4 border-t">
              <Button 
                type="submit" 
                form="profile-form" 
                disabled={isSavingProfile} 
                className="w-full gap-2 bg-primary text-primary-foreground"
              >
                <Save className="h-4 w-4" /> {isSavingProfile ? "Saving Changes..." : "Save Profile Details"}
              </Button>
            </div>
          </div>

          {/* Security & Password */}
          <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b pb-3">
                <Shield className="h-5 w-5 text-emerald-500" />
                <h3 className="font-bold text-base">
                  {profile?.hasPassword ? "Security & Change Password" : "Set Account Password"}
                </h3>
              </div>

              {passSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> {passSuccess}
                </div>
              )}
              {passError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {passError}
                </div>
              )}

              {!profile?.hasPassword && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-lg text-xs leading-relaxed">
                  Your account currently uses Google Sign-In. You can set a password below to also enable standard email/password login.
                </div>
              )}

              <form id="password-form" onSubmit={handleChangePassword} className="space-y-4">
                {profile?.hasPassword && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Current Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                        <KeyRound className="h-4 w-4" />
                      </div>
                      <input
                        type={showCurrentPass ? "text" : "password"}
                        className="w-full pl-10 pr-10 p-2.5 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="••••••••"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required={profile?.hasPassword}
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                      >
                        {showCurrentPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {profile?.hasPassword ? "New Password" : "Create Password"}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <input
                      type={showNewPass ? "text" : "password"}
                      className="w-full pl-10 pr-10 p-2.5 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="At least 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                      onClick={() => setShowNewPass(!showNewPass)}
                    >
                      {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Confirm New Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <input
                      type={showConfirmPass ? "text" : "password"}
                      className="w-full pl-10 pr-10 p-2.5 bg-background border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Repeat new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                    >
                      {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            <div className="mt-6 pt-4 border-t">
              <Button 
                type="submit" 
                form="password-form" 
                disabled={isChangingPass} 
                variant="outline" 
                className="w-full gap-2 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
              >
                <KeyRound className="h-4 w-4" /> {isChangingPass ? "Saving Password..." : profile?.hasPassword ? "Update Password" : "Set Password"}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
