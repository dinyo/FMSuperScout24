namespace FMSuperScout.Reader;

// FM24 JOB_PREFERENCES is 15 bytes, distinct from the contract job enum.
// Recovered with REA from RVAs 0x21338D0, 0x2133790 and 0x437E410.
internal static class StaffJobPreferences
{
    internal const int Count = 15;
    internal static readonly string[] Roles = {
        "Head Coach", "Assistant Coach", "Coach", "Physio", "Scout",
        "Goalkeeping Coach", "Fitness Coach", "Set Piece Coach", "Chairman",
        "Director of Football", "Head of Youth Development", "Loan Manager",
        "Data Analysis", "Sports Scientist", "Technical Director",
    };

    // Native comparison order; equal scores keep the earlier role.
    private static readonly (int index, int job)[] SelectionOrder = {
        (0, 16), (9, 10), (14, 88), (11, 86), (10, 64), (1, 20),
        (5, 34), (6, 26), (7, 22), (2, 2), (3, 12), (12, 60), (13, 48), (4, 14), (8, 4),
    };

    internal static bool IsValid(byte[]? values) => values is { Length: Count } &&
        values.All(value => value <= 20);

    internal static int? PreferredJob(byte[]? values, int judgingAbility, int tacticalKnowledge)
    {
        if (!IsValid(values)) return null;
        int best = 1;
        int? job = null;
        foreach (var candidate in SelectionOrder)
            if (values![candidate.index] > best)
            {
                best = values[candidate.index];
                job = candidate.job;
            }
        // FM specializes the shared analytical preference using JPA / tactical knowledge.
        // RVA 0x25BDE30 uses the staff 1-100 attributes rounded onto the 1-20 scale.
        if (job == 60 && Math.Clamp((judgingAbility + 2) / 5, 1, 20) /
            (float)Math.Clamp((tacticalKnowledge + 2) / 5, 1, 20) >= 1.2f) job = 58;
        return job;
    }

    internal static Dictionary<string, int>? Interests(byte[]? values)
    {
        if (!IsValid(values)) return null;
        var result = new Dictionary<string, int>();
        for (int i = 0; i < Count; i++) result[Roles[i]] = values![i];
        return result;
    }
}
