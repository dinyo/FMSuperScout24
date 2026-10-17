#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdint>
#include <cstring>

namespace {
constexpr uint32_t kMagic = 0x46534D49; // "IMSF"
constexpr uint32_t kVersion = 2;
constexpr uint32_t kMessageMarker = 0x46534D51; // "QMSF"
constexpr uint32_t kMaxPlayers = 128;
constexpr int32_t kUnknown = -1;
constexpr int32_t kNotInterested = -2;
constexpr uint32_t kTransferMode = 0;
constexpr uint32_t kHappinessMode = 1;

struct PlayerInput {
    uint32_t id;
    uint32_t reserved;
    uint64_t person;
    uint64_t player;
    uint64_t team;
    uint64_t club;
};

struct PlayerResult {
    uint32_t id;
    uint32_t errorMask;
    int32_t valueStatus;
    int32_t valueMin;
    int32_t valueMax;
    int32_t minimumBidStatus;
    int32_t minimumBid;
    int32_t interest;
    int32_t loanInterest;
    int32_t atAccepted;
    int32_t atUnchanged;
    int32_t atCash;
    int32_t belowAccepted;
    int32_t belowUnchanged;
    int32_t belowCash;
    int32_t happinessRaw;
    int32_t happinessStatus;
    int32_t happinessError;
};

struct Request {
    uint32_t magic;
    uint32_t version;
    uint32_t count;
    volatile LONG state;
    uint32_t errorCode;
    uint32_t mode;
    uint64_t base;
    uint64_t manager;
    uint64_t managerPerson;
    uint64_t team;
    uint64_t club;
    uint32_t buyerClubId;
    uint32_t reserved2;
    int32_t levels[7];
    PlayerInput players[kMaxPlayers];
    PlayerResult results[kMaxPlayers];
    char errorText[128];
};

using ValueRoutine = uint64_t(__fastcall*)(uint64_t, uint64_t, int32_t*, int32_t*, uint64_t, uint64_t, uint64_t, uint64_t);
using PriceRoutine = int64_t(__fastcall*)(uint64_t, uint64_t, int32_t, int32_t, int32_t, int32_t);
using OfferRoutine = void(__fastcall*)(uint64_t);
using EvaluateRoutine = uint64_t(__fastcall*)(uint64_t, uint64_t, int32_t, int32_t);
using InterestRoutine = uint64_t(__fastcall*)(uint64_t, uint64_t, uint64_t, uint64_t);
using ContractRoutine = uint64_t(__fastcall*)(uint64_t, uint64_t, uint64_t);
using UnaryRoutine = uint64_t(__fastcall*)(uint64_t);
using PredicateRoutine = uint64_t(__fastcall*)(uint64_t, uint64_t);
using HappinessRoutine = int64_t(__fastcall*)(uint64_t, uint64_t, uint64_t);

bool has_prefix(uint64_t base, uint64_t rva, const uint8_t* expected, size_t size) {
    return std::memcmp(reinterpret_cast<const void*>(base + rva), expected, size) == 0;
}

bool has_address_prefix(uint64_t address, const uint8_t* expected, size_t size) {
    MEMORY_BASIC_INFORMATION info{};
    if (!address || VirtualQuery(reinterpret_cast<const void*>(address), &info, sizeof(info)) != sizeof(info) ||
        info.State != MEM_COMMIT || (info.Protect & (PAGE_GUARD | PAGE_NOACCESS))) return false;
    DWORD protection = info.Protect & 0xff;
    if (protection != PAGE_EXECUTE && protection != PAGE_EXECUTE_READ &&
        protection != PAGE_EXECUTE_READWRITE && protection != PAGE_EXECUTE_WRITECOPY) return false;
    uintptr_t start = reinterpret_cast<uintptr_t>(info.BaseAddress);
    uintptr_t end = start + info.RegionSize;
    return address >= start && address <= end && size <= end - address &&
        std::memcmp(reinterpret_cast<const void*>(address), expected, size) == 0;
}

uint32_t supported_happiness_check(Request* request) {
    static const uint8_t reason[] = {0x89,0xd0,0x0f,0xb7,0xc9,0x8d,0x91,0x7c,0xfc,0xff,0xff,0x83,0xfa,0x1e};
    static const uint8_t active[] = {0x44,0x0f,0xb6,0xc1,0xb0,0x01,0x41,0x8d,0x48,0xed};
    static const uint8_t thunk[] = {0xe9};
    static const uint8_t fallback[] = {0x41,0x57,0x41,0x56,0x41,0x54,0x56,0x57,0x55,0x53,0x48,0x83,0xec,0x50,0x31,0xc0,0x48,0x85,0xd2};
    if (!has_prefix(request->base, 0x2737920, reason, sizeof(reason))) return 21;
    if (!has_prefix(request->base, 0x2735890, active, sizeof(active))) return 22;
    uint64_t entry = request->base + 0x4a8a150;
    if (!has_address_prefix(entry, thunk, sizeof(thunk))) return 23;
    int32_t displacement = 0;
    std::memcpy(&displacement, reinterpret_cast<const void*>(entry + 1), sizeof(displacement));
    uint64_t target = entry + 5 + static_cast<int64_t>(displacement);
    if (!has_address_prefix(target, fallback, sizeof(fallback))) return 24;
    return 0;
}

int value_exception_filter(PEXCEPTION_POINTERS exception, PlayerResult* result) {
    result->valueStatus = static_cast<int32_t>(exception->ExceptionRecord->ExceptionCode);
    result->valueMin = static_cast<int32_t>(reinterpret_cast<uintptr_t>(exception->ExceptionRecord->ExceptionAddress));
    result->valueMax = exception->ExceptionRecord->NumberParameters > 1
        ? static_cast<int32_t>(exception->ExceptionRecord->ExceptionInformation[1]) : 0;
    return EXCEPTION_EXECUTE_HANDLER;
}

uint32_t supported_build_check(Request* request) {
    static const uint8_t price[] = {0x41,0x57,0x41,0x56,0x41,0x55,0x41,0x54,0x56,0x57,0x55,0x53,0x48,0x81,0xec,0x28,0x01,0x00,0x00};
    static const uint8_t value[] = {0x55,0x41,0x57,0x41,0x56,0x41,0x55,0x41,0x54,0x56,0x57,0x53,0x48,0x81,0xec,0x68,0x01,0x00,0x00};
    static const uint8_t valueCore[] = {0x41,0x57,0x41,0x56,0x41,0x55,0x41,0x54,0x56,0x57,0x55,0x53,0x48,0x81,0xec,0x88,0x00,0x00,0x00,0x41,0xc7,0x00,0xff,0xff,0xff,0xff,0x41,0xc7,0x01,0xff,0xff,0xff,0xff};
    static const uint8_t transfer[] = {0x41,0x57,0x41,0x56,0x41,0x55,0x41,0x54,0x56,0x57,0x55,0x53,0x48,0x83,0xec,0x58,0x40,0xb6,0x01,0x80,0x3d,0xb9,0x4b,0xbc};
    static const uint8_t loan[] = {0x41,0x57,0x41,0x56,0x41,0x55,0x41,0x54,0x56,0x57,0x55,0x53,0x48,0x83,0xec,0x58,0x40,0xb5,0x01,0x80,0x3d,0x19,0x54,0xbc};
    static const uint8_t offer[] = {0x55,0x56,0x48,0x83,0xec,0x28,0x48,0x8d,0x6c,0x24,0x20,0x48,0xc7,0x45,0x00,0xfe,0xff,0xff,0xff,0x48,0x89,0xce,0xc7,0x41};
    static const uint8_t evaluator[] = {0x55,0x41,0x57,0x41,0x56,0x41,0x55,0x41,0x54,0x56,0x57,0x53,0x48,0x81,0xec,0x78,0x01,0x00,0x00};
    if (!has_prefix(request->base, 0x21953e0, price, sizeof(price))) return 1;
    if (!has_prefix(request->base, 0x21b9560, value, sizeof(value))) return 2;
    if (!has_prefix(request->base, 0x21ca070, valueCore, sizeof(valueCore))) return 3;
    if (!has_prefix(request->base, 0x48706b0, transfer, sizeof(transfer))) return 4;
    if (!has_prefix(request->base, 0x486fe50, loan, sizeof(loan))) return 5;
    if (!has_prefix(request->base, 0x49dab60, offer, sizeof(offer))) return 6;
    if (!has_prefix(request->base, 0x39c4950, evaluator, sizeof(evaluator))) return 7;
    static const int32_t expectedLevels[7] = {-100000, -10000, -2000, 0, 5000, 10000, 30000};
    if (std::memcmp(request->levels, expectedLevels, sizeof(expectedLevels)) != 0) return 8;
    return 0;
}

bool value_query(Request* request, const PlayerInput& player, PlayerResult* result) {
    __try {
        int32_t low = -1;
        int32_t high = -1;
        auto fn = reinterpret_cast<ValueRoutine>(request->base + 0x21ca070);
        uint64_t status = fn(player.player, request->manager, &low, &high, 0, 0, 0, 0);
        result->valueMin = low;
        result->valueMax = high;
        result->valueStatus = static_cast<int32_t>(status & 0xffffffffu);
        return true;
    } __except (value_exception_filter(GetExceptionInformation(), result)) {
        return false;
    }
}

bool offer_query(Request* request, const PlayerInput& player, int32_t bid,
                 int32_t* accepted, int32_t* unchanged, int32_t* cash) {
    __try {
        alignas(16) uint8_t offer[0x1000] = {};
        auto construct = reinterpret_cast<OfferRoutine>(request->base + 0x49dab60);
        auto evaluate = reinterpret_cast<EvaluateRoutine>(request->base + 0x39c4950);
        construct(reinterpret_cast<uint64_t>(offer));
        std::memcpy(offer + 0x30, &player.person, sizeof(uint64_t));
        std::memcpy(offer + 0x38, &request->team, sizeof(uint64_t));
        std::memcpy(offer + 0x48, &player.team, sizeof(uint64_t));
        std::memcpy(offer + 0x50, &bid, sizeof(int32_t));
        uint64_t transferManager = *reinterpret_cast<uint64_t*>(request->base + 0x6374650);
        uint64_t result = evaluate(transferManager, reinterpret_cast<uint64_t>(offer), 0, -1);
        int32_t finalBid = 0;
        uint64_t extras = 0;
        uint8_t exchanges[24] = {};
        std::memcpy(&finalBid, offer + 0x50, sizeof(finalBid));
        std::memcpy(&extras, offer + 0xa8, sizeof(extras));
        std::memcpy(exchanges, offer + 0x90, sizeof(exchanges));
        *accepted = (result & 0xffu) != 0;
        *unchanged = finalBid == bid && extras == 0 && std::memcmp(exchanges, "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0", sizeof(exchanges)) == 0;
        *cash = finalBid;
        return true;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        *cash = static_cast<int32_t>(GetExceptionCode());
        return false;
    }
}

bool minimum_bid_query(Request* request, const PlayerInput& player, PlayerResult* result) {
    if (!player.club || player.club == request->club) {
        result->minimumBidStatus = -1;
        return true;
    }
    __try {
        auto price = reinterpret_cast<PriceRoutine>(request->base + 0x21953e0);
        int32_t bid = static_cast<int32_t>(price(player.player, request->club, -1, 0, 0, 0));
        if (bid < 0) {
            result->minimumBidStatus = 0;
            return true;
        }
        if (!offer_query(request, player, bid, &result->atAccepted, &result->atUnchanged, &result->atCash)) {
            result->minimumBidStatus = 3;
            return false;
        }
        if (bid && !offer_query(request, player, bid - 1, &result->belowAccepted, &result->belowUnchanged, &result->belowCash)) {
            result->minimumBidStatus = 4;
            return false;
        }
        bool at = result->atAccepted && result->atUnchanged;
        bool below = bid && result->belowAccepted && result->belowUnchanged;
        if (!at || below) {
            result->minimumBidStatus = 2;
            return true;
        }
        result->minimumBid = bid;
        result->minimumBidStatus = 1;
        return true;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        result->minimumBidStatus = 5;
        result->minimumBid = static_cast<int32_t>(GetExceptionCode());
        return false;
    }
}

bool interest_passes(Request* request, const PlayerInput& player, int level, bool isLoan) {
    alignas(16) uint8_t local[0x10000] = {};
    uint64_t rule = reinterpret_cast<uint64_t>(local);
    uint64_t props = rule + 0x100;
    uint64_t typed = rule + 0x200;
    uint64_t row = rule + 0x300;
    uint64_t context = rule + 0x400;
    uint64_t filter = *reinterpret_cast<uint64_t*>(request->base + 0x6427890);
    uint32_t propertyKey = 0x666c766c;
    uint32_t zero = 0;
    uint64_t typedPointer = typed;
    uint64_t typePointer = filter + 0x28;
    int64_t threshold = request->levels[level];
    uint64_t personPointer = player.person;
    uint64_t endProps = props + 16;
    uint64_t manager = request->manager;
    uint64_t team = request->team;
    uint64_t managerPerson = request->managerPerson;
    uint64_t ruleVtable = request->base + (isLoan ? 0x5a81638 : 0x5a818d8);
    std::memcpy(reinterpret_cast<void*>(rule), &ruleVtable, sizeof(ruleVtable));
    std::memcpy(reinterpret_cast<void*>(rule + 0x10), &props, sizeof(props));
    std::memcpy(reinterpret_cast<void*>(rule + 0x18), &endProps, sizeof(endProps));
    *reinterpret_cast<uint64_t*>(rule + 0x38) = 1;
    std::memcpy(reinterpret_cast<void*>(props), &propertyKey, sizeof(propertyKey));
    std::memcpy(reinterpret_cast<void*>(props + 4), &zero, sizeof(zero));
    std::memcpy(reinterpret_cast<void*>(props + 8), &typedPointer, sizeof(typedPointer));
    std::memcpy(reinterpret_cast<void*>(typed), &typePointer, sizeof(typePointer));
    std::memcpy(reinterpret_cast<void*>(typed + 8), &threshold, sizeof(threshold));
    std::memcpy(reinterpret_cast<void*>(row + 8), &personPointer, sizeof(personPointer));
    std::memcpy(reinterpret_cast<void*>(context + 8), &manager, sizeof(manager));
    std::memcpy(reinterpret_cast<void*>(context + 0x18), &team, sizeof(team));
    std::memcpy(reinterpret_cast<void*>(context + 0x20), &managerPerson, sizeof(managerPerson));
    auto fn = reinterpret_cast<InterestRoutine>(request->base + (isLoan ? 0x486fe50 : 0x48706b0));
    return (fn(rule, row, context, 0) & 0xffu) != 0;
}

bool interest_query(Request* request, const PlayerInput& player, bool isLoan, int32_t* output) {
    if (player.club == request->club) {
        *output = kUnknown;
        return true;
    }
    __try {
        if (!interest_passes(request, player, 1, isLoan)) {
            *output = kNotInterested;
            return true;
        }
        int low = 1, high = 6;
        while (low < high) {
            int level = (low + high + 1) / 2;
            if (interest_passes(request, player, level, isLoan)) low = level;
            else high = level - 1;
        }
        *output = low - 1;
        return true;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return false;
    }
}

bool query_player(Request* request, uint32_t index) {
    PlayerInput& player = request->players[index];
    PlayerResult& result = request->results[index];
    result.id = player.id;
    result.valueStatus = 0;
    result.valueMin = -1;
    result.valueMax = -1;
    result.minimumBidStatus = 0;
    result.minimumBid = -1;
    result.interest = kUnknown;
    result.loanInterest = kUnknown;
    result.happinessRaw = -1;
    result.happinessStatus = -128;
    result.happinessError = 0;
    if (!player.id || !player.person || !player.player ||
        *reinterpret_cast<uint32_t*>(player.person + 0xc) != player.id) {
        result.errorMask = 0x80000000u;
        return false;
    }
    if (!value_query(request, player, &result)) result.errorMask |= 1;
    if (!minimum_bid_query(request, player, &result)) result.errorMask |= 2;
    if (!interest_query(request, player, false, &result.interest)) result.errorMask |= 4;
    if (!interest_query(request, player, true, &result.loanInterest)) result.errorMask |= 8;
    return result.errorMask == 0;
}

bool happiness_query(Request* request, const PlayerInput& player, PlayerResult* result) {
    // Error codes are mapped to user-facing messages by the host worker.
    constexpr int32_t kNoContract = 1;
    constexpr int32_t kUnsupportedContract = 2;
    constexpr int32_t kInvalidRawScore = 3;
    constexpr int32_t kInvalidHistory = 4;
    constexpr int32_t kUnknownStatus = 5;
    constexpr int32_t kNativeException = 6;
    result->happinessRaw = -1;
    result->happinessStatus = -128;
    result->happinessError = 0;
    if (player.club != request->club) {
        result->happinessError = kUnsupportedContract;
        return false;
    }
    __try {
        auto** personVtable = reinterpret_cast<uint64_t**>(player.person);
        auto contractGetter = reinterpret_cast<ContractRoutine>(personVtable[0][0x400 / sizeof(uint64_t)]);
        uint64_t contract = contractGetter(player.person, player.club, 0);
        if (!contract) { result->happinessError = kNoContract; return false; }

        auto** contractVtable = reinterpret_cast<uint64_t**>(contract);
        auto kindGetter = reinterpret_cast<UnaryRoutine>(contractVtable[0][0x88 / sizeof(uint64_t)]);
        if ((kindGetter(contract) & 0xffu) == 5) {
            result->happinessError = kUnsupportedContract;
            return false;
        }

        int8_t raw = *reinterpret_cast<int8_t*>(contract + 0x54);
        if (raw < -100 || raw > 100) { result->happinessError = kInvalidRawScore; return false; }
        result->happinessRaw = raw;

        uint64_t ring = *reinterpret_cast<uint64_t*>(contract + 0x28);
        uint8_t count = ring ? *reinterpret_cast<uint8_t*>(ring) : 0;
        uint8_t first = ring ? *reinterpret_cast<uint8_t*>(ring + 0x58) : 0;
        if (count > 10 || first > 9) { result->happinessError = kInvalidHistory; return false; }

        auto ignored = reinterpret_cast<PredicateRoutine>(request->base + 0x2737920);
        auto active = reinterpret_cast<PredicateRoutine>(request->base + 0x2735890);
        int32_t best = 0;
        int32_t hint = 0;
        for (int32_t index = static_cast<int32_t>(count) - 1; index >= 0; --index) {
            uint64_t event = *reinterpret_cast<uint64_t*>(ring + 8 + ((index + first) % 10) * 8);
            if (!event) { result->happinessError = kInvalidHistory; return false; }
            int8_t severity = *reinterpret_cast<int8_t*>(event + 0x18);
            uint16_t reason = *reinterpret_cast<uint16_t*>(event + 0x16);
            uint8_t kind = *reinterpret_cast<uint8_t*>(event + 0x19);
            if (severity < -2 || (ignored(reason, 0) & 0xffu)) continue;
            if (!(active(kind, reason) & 0xffu)) continue;
            uint32_t end = *reinterpret_cast<uint32_t*>(event + 4);
            if ((end >> 16) != 1900 || (end & 0x1ffu) != 1) continue;
            int32_t status = severity == -1 ? 1 : severity;
            if (status > best || ((kind != 19 && kind != 20) && hint >= 2)) {
                best = status;
                hint = kind == 19 ? 2 : kind == 20 ? 3 : 1;
            }
        }

        if (best == 0) {
            uint64_t* global = reinterpret_cast<uint64_t*>(request->base + 0x6433050);
            uint64_t context = *global;
            auto fallback = reinterpret_cast<HappinessRoutine>(request->base + 0x4a8a150);
            best = static_cast<int8_t>(fallback(context, player.player, contract));
        }
        switch (best) {
        case -5: case -4: case -3: case -2: case 0: case 1:
            result->happinessStatus = best;
            return true;
        default:
            result->happinessError = kUnknownStatus;
            return false;
        }
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        result->happinessError = kNativeException;
        return false;
    }
}

void happiness_query_guarded(Request* request, uint32_t index) {
    PlayerInput& player = request->players[index];
    PlayerResult& result = request->results[index];
    result.id = player.id;
    result.errorMask = 0;
    result.happinessRaw = -1;
    result.happinessStatus = -128;
    result.happinessError = 0;
    if (!player.id || !player.person || !player.player ||
        *reinterpret_cast<uint32_t*>(player.person + 0xc) != player.id) {
        result.errorMask = 0x80000000u;
        return;
    }
    if (!happiness_query(request, player, &result)) result.errorMask |= 0x10;
}

void query_player_guarded(Request* request, uint32_t index) {
    __try {
        query_player(request, index);
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        request->results[index].errorMask |= 0x40000000u;
    }
}

void run_request(Request* request) {
    if (request->magic != kMagic || request->version != kVersion || request->count > kMaxPlayers ||
        request->mode > kHappinessMode) {
        request->errorCode = 1;
        std::strcpy(request->errorText, "Invalid in-process query request.");
        InterlockedExchange(&request->state, 3);
        return;
    }
    uint64_t actualBase = reinterpret_cast<uint64_t>(GetModuleHandleW(nullptr));
    if (!request->base || request->base != actualBase) {
        request->errorCode = 2;
        std::strcpy(request->errorText, "The request executable base does not match FM's loaded image.");
        InterlockedExchange(&request->state, 3);
        return;
    }
    uint32_t signatureCheck = request->mode == kHappinessMode
        ? supported_happiness_check(request) : supported_build_check(request);
    if (signatureCheck) {
        request->errorCode = 10 + signatureCheck;
        std::strcpy(request->errorText, "FM native routine or interest-threshold validation failed.");
        InterlockedExchange(&request->state, 3);
        return;
    }
    if (!request->manager || !request->managerPerson || !request->team || !request->club ||
        *reinterpret_cast<uint32_t*>(request->club + 0xc) != request->buyerClubId) {
        request->errorCode = 3;
        std::strcpy(request->errorText, "The active manager or buyer club changed before the query.");
        InterlockedExchange(&request->state, 3);
        return;
    }
    request->errorCode = 0;
    for (uint32_t i = 0; i < request->count; ++i) {
        if (request->mode == kHappinessMode) happiness_query_guarded(request, i);
        else query_player_guarded(request, i);
    }
    InterlockedExchange(&request->state, 2);
}

void fail_request_after_exception(Request* request) {
    request->errorCode = 4;
    const char message[] = "FM raised an exception while evaluating a native query.";
    std::memcpy(request->errorText, message, sizeof(message));
    InterlockedExchange(&request->state, 3);
}

bool request_memory_is_valid(void* address) {
    MEMORY_BASIC_INFORMATION info{};
    if (!address || VirtualQuery(address, &info, sizeof(info)) != sizeof(info) || info.State != MEM_COMMIT)
        return false;
    uintptr_t start = reinterpret_cast<uintptr_t>(address);
    uintptr_t end = start + sizeof(Request);
    uintptr_t regionEnd = reinterpret_cast<uintptr_t>(info.BaseAddress) + info.RegionSize;
    DWORD protection = info.Protect & 0xff;
    return end >= start && end <= regionEnd &&
        (protection == PAGE_READWRITE || protection == PAGE_WRITECOPY ||
         protection == PAGE_EXECUTE_READWRITE || protection == PAGE_EXECUTE_WRITECOPY);
}
}

extern "C" __declspec(dllexport) LRESULT CALLBACK FMSS_CwpHook(int code, WPARAM wParam, LPARAM lParam) {
    if (code >= 0 && lParam) {
        __try {
            auto* message = reinterpret_cast<CWPSTRUCT*>(lParam);
            if (message->message == WM_NULL && message->wParam == kMessageMarker) {
                auto* request = reinterpret_cast<Request*>(message->lParam);
                if (request_memory_is_valid(request)) {
                    __try {
                        run_request(request);
                    } __except (EXCEPTION_EXECUTE_HANDLER) {
                        fail_request_after_exception(request);
                    }
                }
            }
        } __except (EXCEPTION_EXECUTE_HANDLER) {
            // Never allow a malformed request buffer to take down the game window procedure.
        }
    }
    return CallNextHookEx(nullptr, code, wParam, lParam);
}

BOOL WINAPI DllMain(HINSTANCE, DWORD, LPVOID) {
    return TRUE;
}
