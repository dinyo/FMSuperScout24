using FMSuperScout.Reader;

static void Check(bool passed, string message) { if (!passed) throw new Exception(message); }
byte[] dylan = { 11, 13, 15, 8, 10, 1, 1, 1, 1, 5, 20, 8, 1, 1, 5 };
Check(StaffJobPreferences.PreferredJob(dylan, 87, 35) == 64, "Dylan should prefer Head of Youth Development");
var list = StaffJobPreferences.Interests(dylan)!;
Check(list.Count == 15 && list["Head of Youth Development"] == 20 && list["Coach"] == 15, "Full list must preserve raw values");
int[] jobs = { 16, 20, 2, 12, 14, 34, 26, 22, 4, 10, 64, 86, 60, 48, 88 };
for (int i = 0; i < 15; i++) {
    var values = Enumerable.Repeat((byte)1, 15).ToArray(); values[i] = 20;
    Check(StaffJobPreferences.PreferredJob(values, 50, 50) == jobs[i], $"Wrong role at index {i}");
}
var tie = Enumerable.Repeat((byte)1, 15).ToArray(); tie[0] = tie[10] = 20;
Check(StaffJobPreferences.PreferredJob(tie, 50, 50) == 16, "Native tie order must be stable");
var analyst = Enumerable.Repeat((byte)1, 15).ToArray(); analyst[12] = 20;
Check(StaffJobPreferences.PreferredJob(analyst, 90, 40) == 58, "Analytical specialization");
Check(StaffJobPreferences.PreferredJob(new byte[15], 0, 0) == null, "Unset preferences must remain unknown");
Check(StaffJobPreferences.PreferredJob(Enumerable.Repeat((byte)1, 15).ToArray(), 0, 0) == null, "No positive preference");
Check(StaffJobPreferences.Interests(null) == null && StaffJobPreferences.Interests(new byte[14]) == null &&
    StaffJobPreferences.Interests(Enumerable.Repeat((byte)255, 15).ToArray()) == null, "Invalid reads must be rejected");
Console.WriteLine("Staff preference checks passed: live Dylan fixture, 15 roles, ties, analysis and invalid inputs.");
