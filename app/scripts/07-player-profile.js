// ---------- player profile ----------
// FM attribute colors: 16-20 green, 11-15 orange, 1-10 whitish. Also for potential projection.
const attrClass = (v) => (v >= 16 ? 'at-hi' : v >= 11 ? 'at-mid' : 'at-lo');
// Attribute families for potential projection.
const PHYS_ATTRS = new Set([
  'Acceleration',
  'Agility',
  'Balance',
  'JumpingReach',
  'NaturalFitness',
  'Pace',
  'Stamina',
  'Strength',
]);
const MENTAL_ATTRS = new Set([
  'Aggression',
  'Anticipation',
  'Bravery',
  'Composure',
  'Concentration',
  'Decisions',
  'Determination',
  'Flair',
  'Leadership',
  'OffTheBall',
  'Positioning',
  'Teamwork',
  'Vision',
  'WorkRate',
]);
const SETPIECE_ATTRS = new Set(['Corners', 'FreeKicks', 'PenaltyTaking', 'LongThrows']);
// Physical growth is strongly age-related: peaks young, plateaus ~24, declines after ~30.
function physGrowthFactor(age) {
  if (age == null) return 0.6;
  if (age <= 20) return 1.0;
  if (age <= 23) return 0.8;
  if (age <= 26) return 0.55;
  if (age <= 29) return 0.3;
  if (age <= 32) return 0.12;
  return 0.05;
}
// Mental growth actually continues (and accelerates relatively) at a later age.
function mentalGrowthFactor(age) {
  if (age == null) return 1.0;
  if (age >= 32) return 1.25;
  if (age >= 28) return 1.15;
  return 1.0;
}
// ----- Potential projection: position profile model, measured on own dump -----
// Two findings from analysis of 48,000 players:
// 1. FM ability includes a large base value, so multiplying attributes by PA/CA overestimates growth.
// 2. Attribute growth differs by position; a fullback needs more crossing and tackling than finishing.
// A generic model would turn every young prospect into an unrealistic all-rounder.
// These profiles use average attributes at CA 80/110/140/170 for each position group. Projection
// adds the position-specific PA-to-CA profile difference to current attributes, preserving strengths.
const POS_CA_ANCHORS = [80, 110, 140, 170];
const POS_ATTR_PROFILE = {
  ALL: {
    Crossing: [7.5, 9.5, 10.7, 12],
    Dribbling: [8.2, 10.5, 12.1, 14.2],
    Finishing: [7.4, 8.9, 10, 11.8],
    Heading: [8.3, 9.8, 10.7, 11.7],
    LongShots: [6.7, 9.1, 10.5, 11.9],
    Marking: [7.9, 9.3, 10.3, 11.2],
    OffTheBall: [8.8, 11, 12.3, 13.9],
    Passing: [9.3, 11.3, 12.8, 14.8],
    PenaltyTaking: [5, 8.1, 10, 11.2],
    Tackling: [8.5, 9.6, 10.8, 11.6],
    Vision: [8.3, 10.7, 12.4, 14.5],
    Handling: [2.1, 2.1, 2.1, 2.1],
    AerialReach: [2.1, 2.1, 2.1, 2],
    CommandOfArea: [2.1, 2.1, 2.1, 2.1],
    Communication: [2.1, 2.1, 2.1, 2.2],
    Kicking: [2.1, 2.1, 2.1, 2],
    Throwing: [2.1, 2.1, 2.1, 2],
    Anticipation: [9.4, 11.6, 13.3, 15.1],
    Decisions: [10.9, 11.5, 12.6, 14.4],
    OneOnOnes: [2.1, 2.1, 2.1, 2.1],
    Positioning: [8.3, 9.9, 11.1, 12],
    Reflexes: [2.1, 2.1, 2.1, 2.1],
    FirstTouch: [10.1, 11.6, 13, 15.1],
    Technique: [9.9, 11.8, 13.3, 15.2],
    Flair: [8.9, 10.3, 11.9, 13.8],
    Corners: [5.5, 7.8, 8.9, 9.6],
    Teamwork: [9.1, 11.7, 13.2, 14.4],
    WorkRate: [10.1, 12.2, 13.7, 14.9],
    LongThrows: [4.7, 6.9, 7.8, 7.7],
    Eccentricity: [2.1, 2.1, 2.1, 2.1],
    RushingOut: [2.1, 2.1, 2.1, 2.1],
    Punching: [2.1, 2.1, 2.1, 2],
    Acceleration: [11.7, 12.3, 13.4, 14.7],
    FreeKicks: [5.4, 7.8, 9.1, 10.2],
    Strength: [8, 10.5, 11.9, 13.5],
    Stamina: [10, 11.9, 13.6, 14.9],
    Pace: [11.7, 12.3, 13.5, 14.9],
    JumpingReach: [9.5, 10.6, 11.2, 12],
    Leadership: [8.1, 9.2, 10.2, 11.8],
    Balance: [9.5, 11.4, 12.9, 14.7],
    Bravery: [8.8, 11.2, 12.8, 13.7],
    Aggression: [10.4, 11.3, 12.4, 13.3],
    Agility: [11.2, 11.9, 13.2, 14.8],
    NaturalFitness: [12.1, 12.5, 13.4, 14.8],
    Determination: [11.1, 12.4, 13.8, 15.5],
    Composure: [8.6, 11.1, 12.7, 14.9],
    Concentration: [8.3, 10.7, 12.3, 13.9],
  },
  AMC: {
    Crossing: [8, 10.5, 11.9, 13.2],
    Dribbling: [10, 12.1, 13.7, 15.7],
    Finishing: [9.6, 10.5, 11.9, 13.8],
    Heading: [6.5, 7.9, 8.6, 9.6],
    LongShots: [8.4, 10.7, 12.2, 13.8],
    Marking: [5.8, 7, 7.9, 8.8],
    OffTheBall: [10.3, 12.1, 13.5, 15.1],
    Passing: [10.6, 12.3, 13.8, 15.5],
    PenaltyTaking: [5.9, 9.3, 11.7, 12.6],
    Tackling: [6.2, 7.4, 8.4, 9.1],
    Vision: [10.6, 12.4, 13.9, 15.9],
    Handling: [2.1, 2.1, 2.1, 2.1],
    AerialReach: [2.1, 2.1, 2.1, 2],
    CommandOfArea: [2.1, 2.1, 2.1, 2.2],
    Communication: [2.1, 2.1, 2.1, 2.3],
    Kicking: [2.1, 2.1, 2.1, 1.9],
    Throwing: [2.1, 2.1, 2.2, 2.1],
    Anticipation: [9.1, 11.3, 13, 14.8],
    Decisions: [10.9, 11.6, 12.8, 14.4],
    OneOnOnes: [2.1, 2.1, 2.1, 2],
    Positioning: [6.7, 8.2, 9.2, 9.9],
    Reflexes: [2.1, 2.1, 2.1, 2.1],
    FirstTouch: [11.5, 12.6, 14.2, 16.1],
    Technique: [11.7, 13.1, 14.8, 16.4],
    Flair: [11.9, 13, 14.4, 15.6],
    Corners: [6.7, 9.9, 11.8, 12.5],
    Teamwork: [9.2, 11.3, 12.7, 14.1],
    WorkRate: [10.2, 11.7, 13.1, 14.6],
    LongThrows: [4, 5.4, 5.9, 6.5],
    Eccentricity: [2.1, 2.1, 2.1, 2.1],
    RushingOut: [2.1, 2.1, 2.1, 1.9],
    Punching: [2.1, 2.1, 2.1, 1.9],
    Acceleration: [12, 12.3, 13.3, 14.3],
    FreeKicks: [6.6, 9.8, 11.6, 12.7],
    Strength: [6.7, 8.8, 10, 11.9],
    Stamina: [9.7, 11.4, 13, 14.6],
    Pace: [11.7, 12, 13, 14.3],
    JumpingReach: [8, 8.6, 8.9, 9.8],
    Leadership: [8.1, 8.7, 9.7, 10.9],
    Balance: [9.1, 11.1, 12.8, 14.6],
    Bravery: [7.5, 9.8, 11.2, 12.1],
    Aggression: [9.7, 10.1, 11, 12.1],
    Agility: [11.5, 12.5, 14, 15.6],
    NaturalFitness: [12, 12.2, 13, 14.1],
    Determination: [10.8, 12.2, 13.4, 15.4],
    Composure: [9.5, 11.5, 13, 15.1],
    Concentration: [7.5, 10, 11.6, 13.3],
  },
  DC: {
    Crossing: [5.1, 7.2, 8.4, 8.9],
    Dribbling: [4.8, 7.8, 9.8, 11.3],
    Finishing: [4, 6.1, 7, 8],
    Heading: [11, 12.7, 14, 15.4],
    LongShots: [4.6, 6.8, 7.7, 8.3],
    Marking: [11.7, 12.6, 13.9, 15.4],
    OffTheBall: [5.8, 8.3, 9.5, 9.8],
    Passing: [7.5, 10.6, 12.4, 14.1],
    PenaltyTaking: [3.9, 6.2, 7.6, 8.4],
    Tackling: [11.6, 12.7, 14, 15.6],
    Vision: [6.3, 9.5, 11.3, 13.2],
    Handling: [2.1, 2.1, 2.1, 2.1],
    AerialReach: [2.1, 2.1, 2.1, 1.9],
    CommandOfArea: [2.1, 2.1, 2.1, 2.1],
    Communication: [2.1, 2.1, 2.1, 2],
    Kicking: [2.1, 2.1, 2.1, 2.1],
    Throwing: [2.1, 2.1, 2.2, 2.1],
    Anticipation: [10, 12, 13.8, 15.8],
    Decisions: [11.6, 11.7, 12.7, 14.6],
    OneOnOnes: [2.1, 2.1, 2.1, 1.9],
    Positioning: [11.6, 12.6, 13.8, 15.5],
    Reflexes: [2.1, 2.1, 2, 2],
    FirstTouch: [7.5, 10.2, 11.7, 13.4],
    Technique: [6.9, 10, 11.8, 13.5],
    Flair: [5.8, 7.1, 8.6, 9.8],
    Corners: [3.6, 5.1, 5.4, 5.2],
    Teamwork: [8.3, 11.8, 13.6, 14.7],
    WorkRate: [9, 12, 13.8, 15.1],
    LongThrows: [4.8, 7.9, 9.4, 9.7],
    Eccentricity: [2.1, 2.1, 2.2, 2],
    RushingOut: [2.1, 2.1, 2.2, 2.3],
    Punching: [2.1, 2.1, 2.1, 1.9],
    Acceleration: [10.6, 11.3, 12.5, 13.8],
    FreeKicks: [4.1, 5.6, 6.3, 6.6],
    Strength: [9.7, 12.4, 14.1, 15.8],
    Stamina: [9.3, 11.8, 13.5, 14.5],
    Pace: [10.9, 11.8, 13.4, 14.9],
    JumpingReach: [12.1, 13.5, 14.4, 15.6],
    Leadership: [8.6, 10.6, 12, 13.7],
    Balance: [9.4, 11.6, 13.2, 14.2],
    Bravery: [10.7, 12.7, 14.2, 15.6],
    Aggression: [11.3, 12.4, 13.6, 14.4],
    Agility: [10.2, 10.7, 11.8, 13.1],
    NaturalFitness: [12.1, 12.6, 13.3, 14.7],
    Determination: [11.2, 12.6, 14.1, 15.9],
    Composure: [7.5, 10.8, 12.7, 14.9],
    Concentration: [9.7, 11.6, 13.2, 14.8],
  },
  DM: {
    Crossing: [6, 8.7, 10.2, 11.7],
    Dribbling: [6.5, 9.7, 11.6, 13.8],
    Finishing: [6, 7.8, 9, 10.6],
    Heading: [7.5, 9.7, 10.4, 11.5],
    LongShots: [7.9, 9.7, 11.1, 12.3],
    Marking: [9.4, 11, 12, 12.8],
    OffTheBall: [8, 10.4, 12, 14.2],
    Passing: [10.8, 12.4, 13.9, 16],
    PenaltyTaking: [4.8, 8.1, 10, 10.8],
    Tackling: [11.2, 11.9, 13.1, 14],
    Vision: [9.9, 11.7, 13.3, 15.5],
    Handling: [2.1, 2.1, 2, 2],
    AerialReach: [2.1, 2.1, 2.1, 2.1],
    CommandOfArea: [2.1, 2.1, 2, 2.4],
    Communication: [2.1, 2.1, 2.1, 2.3],
    Kicking: [2.1, 2.1, 2.1, 1.9],
    Throwing: [2.1, 2.1, 2.1, 1.9],
    Anticipation: [9.9, 12.1, 13.8, 15.8],
    Decisions: [11.9, 12.1, 13.2, 15],
    OneOnOnes: [2.1, 2.1, 2.1, 2.3],
    Positioning: [10.3, 11.9, 13.3, 14.3],
    Reflexes: [2.1, 2.1, 2.1, 2],
    FirstTouch: [10.9, 12.1, 13.4, 15.4],
    Technique: [10.4, 12, 13.5, 15.5],
    Flair: [6.8, 9.3, 11.1, 13.6],
    Corners: [5.5, 8, 9.6, 9.7],
    Teamwork: [10.2, 12.9, 14.6, 15.5],
    WorkRate: [11.6, 13.2, 14.7, 15.8],
    LongThrows: [4.2, 6.3, 7.2, 6.9],
    Eccentricity: [2.1, 2.1, 2.1, 2.1],
    RushingOut: [2.1, 2.1, 2.2, 2.1],
    Punching: [2.1, 2.1, 2.1, 1.9],
    Acceleration: [10.8, 11.4, 12.4, 13.6],
    FreeKicks: [6, 8.3, 9.7, 10.1],
    Strength: [8.4, 10.9, 12.3, 13.8],
    Stamina: [10.2, 12.5, 14.4, 16.1],
    Pace: [10.9, 11.5, 12.6, 13.7],
    JumpingReach: [9.6, 10.7, 11, 11.8],
    Leadership: [8.6, 10.4, 11.6, 12.4],
    Balance: [9.7, 11.7, 13.2, 14.9],
    Bravery: [9.5, 12, 13.5, 14.1],
    Aggression: [10.9, 12.2, 13.3, 14.1],
    Agility: [10.4, 11.4, 12.7, 14.4],
    NaturalFitness: [12.2, 12.7, 13.9, 15.1],
    Determination: [11.2, 12.8, 14.2, 15.5],
    Composure: [8.6, 11.5, 13.2, 15.4],
    Concentration: [9.3, 11.6, 13.4, 14.7],
  },
  FB: {
    Crossing: [9.9, 11.3, 12.6, 13.9],
    Dribbling: [7.6, 10.3, 12, 13.4],
    Finishing: [4.9, 7.1, 8.4, 9.9],
    Heading: [7.6, 9.3, 10.1, 11],
    LongShots: [5.4, 8.1, 9.4, 10.8],
    Marking: [9.3, 10.9, 12, 12.7],
    OffTheBall: [7.8, 10.8, 12.5, 14.2],
    Passing: [8.8, 11, 12.4, 14.5],
    PenaltyTaking: [4.3, 6.9, 8.4, 9.3],
    Tackling: [10.7, 11.6, 12.8, 13.3],
    Vision: [7.8, 10.1, 11.7, 13.8],
    Handling: [2.1, 2.1, 2.1, 1.9],
    AerialReach: [2.1, 2.1, 2.1, 2.2],
    CommandOfArea: [2.1, 2.1, 2.2, 1.8],
    Communication: [2.1, 2.1, 2.1, 2.2],
    Kicking: [2.1, 2.1, 2, 1.8],
    Throwing: [2.1, 2.1, 2.1, 1.9],
    Anticipation: [9.3, 11.4, 12.9, 14.8],
    Decisions: [11.1, 11.4, 12.4, 14.3],
    OneOnOnes: [2.1, 2.1, 2.1, 2],
    Positioning: [9.4, 11.2, 12.4, 13.9],
    Reflexes: [2.1, 2.1, 2.1, 2.2],
    FirstTouch: [9.3, 11, 12.5, 14.3],
    Technique: [9.2, 11.2, 12.7, 14.4],
    Flair: [7.4, 9.3, 11.1, 12.7],
    Corners: [5.4, 8, 9.1, 9.4],
    Teamwork: [10, 12.2, 13.6, 14.7],
    WorkRate: [10.3, 12.7, 14.2, 15.1],
    LongThrows: [6.5, 9.8, 11.2, 11.1],
    Eccentricity: [2.1, 2.1, 2.2, 2.1],
    RushingOut: [2.1, 2.1, 2.2, 2.4],
    Punching: [2.1, 2.1, 2.1, 2.1],
    Acceleration: [12.4, 12.8, 14, 15.4],
    FreeKicks: [4.3, 7.1, 8.5, 9.5],
    Strength: [8, 10.2, 11.7, 13.5],
    Stamina: [10.9, 12.4, 14.1, 15.2],
    Pace: [12.2, 12.7, 14.1, 15.5],
    JumpingReach: [9.2, 9.9, 10.7, 11.6],
    Leadership: [8.3, 9, 10, 11.3],
    Balance: [9.8, 11.3, 12.7, 14.5],
    Bravery: [9.9, 11.6, 13.2, 14],
    Aggression: [10.5, 11.5, 12.8, 14],
    Agility: [11.8, 12.2, 13.3, 14.9],
    NaturalFitness: [12.2, 12.7, 13.7, 15.1],
    Determination: [11.1, 12.4, 13.9, 15.6],
    Composure: [7.8, 10.5, 12.2, 14.4],
    Concentration: [9.7, 11.2, 12.6, 14.1],
  },
  GK: {
    Crossing: [2.1, 2.3, 2.3, 2.3],
    Dribbling: [2.1, 2.4, 2.8, 3.7],
    Finishing: [2, 2.1, 2.1, 2.2],
    Heading: [4.3, 5.3, 5.4, 7.3],
    LongShots: [2.1, 2.5, 2.7, 2.5],
    Marking: [2.1, 2.3, 2.4, 1.8],
    OffTheBall: [2.4, 3.4, 4.1, 3.9],
    Passing: [8.2, 10.1, 11.3, 12.6],
    PenaltyTaking: [2.4, 2.8, 3.5, 4.8],
    Tackling: [2.1, 2.5, 2.6, 3],
    Vision: [6.6, 9, 10.5, 12],
    Handling: [11.5, 12.3, 13.4, 15.1],
    AerialReach: [11.4, 13.2, 14.1, 15.4],
    CommandOfArea: [9.6, 11.5, 12.9, 14.6],
    Communication: [9, 11.4, 12.8, 14.6],
    Kicking: [9.9, 11.6, 13, 14],
    Throwing: [8.7, 11.6, 13.2, 14.3],
    Anticipation: [8.8, 11.5, 13, 14.5],
    Decisions: [11.7, 11.5, 12.4, 13.9],
    OneOnOnes: [9.9, 12.6, 14.4, 16.6],
    Positioning: [9.7, 12.1, 13.3, 15.1],
    Reflexes: [12, 13.3, 15.2, 17.1],
    FirstTouch: [4.3, 7.6, 9.7, 11.9],
    Technique: [4.9, 8.1, 9.9, 12],
    Flair: [2.5, 4.4, 5.7, 8.2],
    Corners: [3.2, 3.7, 4.1, 4.7],
    Teamwork: [7.7, 10.8, 12.2, 12.9],
    WorkRate: [6.8, 10.3, 11.9, 13.4],
    LongThrows: [2.1, 2.6, 2.9, 3],
    Eccentricity: [6.5, 8, 8.9, 9.3],
    RushingOut: [9.5, 10.7, 12, 13.2],
    Punching: [9.3, 10.3, 11, 10.6],
    Acceleration: [9.4, 9.7, 10.3, 11.1],
    FreeKicks: [4.3, 4.9, 5.2, 5.4],
    Strength: [7.4, 10.8, 12.4, 13.4],
    Stamina: [5.7, 9.4, 11.3, 12.2],
    Pace: [8.9, 9.6, 10.3, 11.3],
    JumpingReach: [12.7, 14.1, 14.9, 15.6],
    Leadership: [8, 9.9, 11.4, 13],
    Balance: [8.3, 10.8, 12, 12.4],
    Bravery: [11.5, 12.2, 13.2, 14.1],
    Aggression: [9.2, 9.5, 10.1, 11.7],
    Agility: [10.7, 12, 13.3, 15],
    NaturalFitness: [11.7, 12.2, 13.1, 13.6],
    Determination: [11.1, 12.3, 13.6, 15.5],
    Composure: [7.2, 10.7, 12.6, 14.3],
    Concentration: [10.2, 11.6, 12.9, 14.5],
  },
  MC: {
    Crossing: [6.7, 9.5, 10.9, 12.2],
    Dribbling: [7.6, 10.6, 12.3, 14.3],
    Finishing: [7.2, 8.8, 10.1, 11.8],
    Heading: [6.6, 8.7, 9.6, 10.9],
    LongShots: [8.4, 10.3, 11.6, 13],
    Marking: [8.3, 9.7, 10.7, 11.8],
    OffTheBall: [9.1, 11.3, 12.7, 14.7],
    Passing: [11.4, 12.7, 14, 15.9],
    PenaltyTaking: [5.1, 8.6, 10.7, 11.5],
    Tackling: [9.1, 10.5, 11.6, 12.6],
    Vision: [10.8, 12.2, 13.6, 15.7],
    Handling: [2.1, 2.1, 2.1, 2.1],
    AerialReach: [2.1, 2.1, 2.1, 2.1],
    CommandOfArea: [2.1, 2.1, 2.1, 2.2],
    Communication: [2.1, 2.1, 2.1, 2.2],
    Kicking: [2.1, 2.1, 2.1, 1.9],
    Throwing: [2.1, 2.1, 2.2, 1.9],
    Anticipation: [9.4, 11.9, 13.5, 15.3],
    Decisions: [11.5, 12, 13.1, 14.9],
    OneOnOnes: [2.1, 2.1, 2.1, 2.2],
    Positioning: [8.7, 10.8, 12.1, 13.2],
    Reflexes: [2.1, 2.1, 2.1, 2],
    FirstTouch: [11.6, 12.4, 13.7, 15.6],
    Technique: [11.2, 12.6, 14, 15.8],
    Flair: [8.8, 10.7, 12.4, 14.4],
    Corners: [6.1, 9, 10.6, 11],
    Teamwork: [9.9, 12.5, 14.1, 15.3],
    WorkRate: [11.4, 12.9, 14.2, 15.6],
    LongThrows: [4.1, 6, 6.8, 7],
    Eccentricity: [2.1, 2.1, 2.1, 2.1],
    RushingOut: [2.1, 2.1, 2.2, 2.2],
    Punching: [2.1, 2.1, 2.1, 1.9],
    Acceleration: [11.3, 11.7, 12.6, 13.8],
    FreeKicks: [6.2, 9, 10.5, 11.4],
    Strength: [7.7, 10.1, 11.5, 13.1],
    Stamina: [10.3, 12.2, 14.1, 15.8],
    Pace: [11.3, 11.7, 12.7, 13.9],
    JumpingReach: [8.8, 9.7, 10.3, 11.2],
    Leadership: [8.4, 9.9, 11, 12.1],
    Balance: [9.4, 11.5, 13, 14.5],
    Bravery: [8.3, 11.2, 12.8, 13.8],
    Aggression: [10.6, 11.6, 12.6, 13.8],
    Agility: [11, 11.9, 13.1, 14.7],
    NaturalFitness: [12.2, 12.5, 13.6, 15],
    Determination: [11.2, 12.6, 13.9, 15.7],
    Composure: [8.9, 11.6, 13.2, 15.3],
    Concentration: [8.7, 11.1, 12.8, 14.4],
  },
  ST: {
    Crossing: [6.5, 8.7, 9.7, 11.4],
    Dribbling: [10.6, 11.3, 12.4, 14.9],
    Finishing: [11.8, 12.4, 13.9, 15.5],
    Heading: [10.5, 11.5, 12.7, 12.5],
    LongShots: [7, 9.8, 11.4, 13],
    Marking: [4.8, 6.2, 6.9, 7.6],
    OffTheBall: [11.3, 12.7, 14.1, 15.7],
    Passing: [8.2, 10.4, 11.8, 13.8],
    PenaltyTaking: [6.4, 10.2, 12.6, 14.5],
    Tackling: [4.1, 6, 6.9, 7.5],
    Vision: [7.4, 10.1, 11.8, 13.9],
    Handling: [2.1, 2.1, 2.1, 2],
    AerialReach: [2.1, 2.1, 2.1, 2],
    CommandOfArea: [2.1, 2.1, 2.1, 2.1],
    Communication: [2.1, 2.1, 2.1, 2.2],
    Kicking: [2.1, 2.1, 2.1, 2.1],
    Throwing: [2.1, 2.1, 2.1, 1.9],
    Anticipation: [9.8, 11.8, 13.4, 15.2],
    Decisions: [10, 11.2, 12.4, 14.1],
    OneOnOnes: [2.1, 2.1, 2.2, 2.3],
    Positioning: [5.7, 7.4, 7.9, 8.1],
    Reflexes: [2.1, 2.1, 2.1, 1.9],
    FirstTouch: [11, 11.8, 13, 15.2],
    Technique: [10.5, 11.9, 13.4, 15.4],
    Flair: [11, 11.5, 12.9, 15.2],
    Corners: [5.3, 7, 7.6, 8.9],
    Teamwork: [8.2, 11, 12.6, 13.9],
    WorkRate: [9.1, 12, 13.5, 14.4],
    LongThrows: [3.7, 5.5, 6.1, 6.4],
    Eccentricity: [2.1, 2.1, 2.1, 2.4],
    RushingOut: [2.1, 2.1, 2.1, 1.8],
    Punching: [2.1, 2.1, 2, 2.2],
    Acceleration: [12, 12.5, 13.6, 15.5],
    FreeKicks: [5.5, 7.7, 8.9, 10.4],
    Strength: [8.5, 11.4, 13, 13.8],
    Stamina: [9.7, 11.6, 13.2, 14.3],
    Pace: [11.8, 12.7, 13.8, 15.6],
    JumpingReach: [10, 11.8, 12.5, 12.5],
    Leadership: [7.8, 8.4, 9.3, 11],
    Balance: [9.5, 11.7, 13.1, 14.9],
    Bravery: [7.8, 11, 12.8, 13.2],
    Aggression: [9.8, 10.9, 12.2, 12.8],
    Agility: [11.1, 11.8, 13, 15.2],
    NaturalFitness: [12.1, 12.3, 13.2, 14.9],
    Determination: [11, 12.4, 14, 15.3],
    Composure: [10.2, 11.6, 13, 14.9],
    Concentration: [6.9, 10.1, 11.8, 13.1],
  },
  W: {
    Crossing: [10, 11.1, 12.2, 13.9],
    Dribbling: [10.7, 12.4, 14, 16.4],
    Finishing: [9, 10.3, 11.6, 14.1],
    Heading: [6.4, 7.9, 8.4, 9.2],
    LongShots: [7.1, 10, 11.6, 13.1],
    Marking: [5.4, 6.7, 7.5, 8],
    OffTheBall: [10.2, 12, 13.3, 15.3],
    Passing: [9.8, 11.3, 12.5, 14.6],
    PenaltyTaking: [5.4, 8.8, 10.8, 12.4],
    Tackling: [5.5, 6.9, 7.7, 7.8],
    Vision: [8.4, 10.9, 12.6, 14.9],
    Handling: [2.1, 2.1, 2, 2.3],
    AerialReach: [2.1, 2.1, 2.1, 2],
    CommandOfArea: [2.1, 2.1, 2.1, 1.9],
    Communication: [2.1, 2.1, 2.1, 2.2],
    Kicking: [2.1, 2.1, 2.1, 2],
    Throwing: [2.1, 2.1, 2.1, 2.1],
    Anticipation: [8.7, 11, 12.5, 14.3],
    Decisions: [9.7, 10.8, 12, 14],
    OneOnOnes: [2.1, 2.1, 2.1, 2.2],
    Positioning: [5.8, 7.5, 8.4, 8.7],
    Reflexes: [2.1, 2.1, 2.1, 2],
    FirstTouch: [10.8, 12, 13.4, 15.8],
    Technique: [11, 12.5, 14.1, 16.2],
    Flair: [11.5, 12.7, 14.2, 16],
    Corners: [6.8, 9.3, 10.8, 12.3],
    Teamwork: [9, 10.7, 12, 13.2],
    WorkRate: [10.1, 11.6, 12.9, 14.1],
    LongThrows: [4.7, 6.2, 6.6, 6.2],
    Eccentricity: [2.1, 2.1, 2.1, 2.2],
    RushingOut: [2.1, 2.1, 2.1, 1.8],
    Punching: [2.1, 2.1, 2.1, 2],
    Acceleration: [12.5, 13.2, 14.5, 15.7],
    FreeKicks: [6.1, 8.8, 10.4, 11.8],
    Strength: [6.6, 8.9, 10.1, 11.6],
    Stamina: [10, 11.4, 12.9, 14.1],
    Pace: [12.3, 12.9, 14.1, 15.2],
    JumpingReach: [7.9, 8.6, 8.9, 9.6],
    Leadership: [7.7, 7.8, 8.5, 10.4],
    Balance: [9.5, 11.1, 12.6, 14.7],
    Bravery: [7.5, 9.8, 11.3, 12],
    Aggression: [9.6, 10.1, 11.1, 11.6],
    Agility: [12.2, 12.9, 14.4, 16.2],
    NaturalFitness: [12, 12.2, 13.1, 14.4],
    Determination: [11.1, 12.1, 13.4, 15.2],
    Composure: [8.4, 10.7, 12.3, 14.5],
    Concentration: [6.9, 9.6, 11.1, 12.9],
  },
};
const POS_GROUP_OF = {
  GK: 'GK',
  SW: 'DC',
  DC: 'DC',
  DL: 'FB',
  DR: 'FB',
  WBL: 'FB',
  WBR: 'FB',
  DM: 'DM',
  MC: 'MC',
  ML: 'W',
  MR: 'W',
  AML: 'W',
  AMR: 'W',
  AMC: 'AMC',
  ST: 'ST',
};
const posGroupsOf = (p) => {
  const gs = [
    ...new Set((p.posArr || []).map((x) => POS_GROUP_OF[x]).filter((g) => POS_ATTR_PROFILE[g])),
  ];
  return gs.length ? gs : ['ALL'];
};
// Position norm for attribute anchors a on arbitrary CA (linear between anchors, extended outside).
function posNorm(a, ca) {
  if (ca <= 80) return a[0] - ((80 - ca) * (a[1] - a[0])) / 30;
  if (ca >= 170) return a[3] + ((ca - 170) * (a[3] - a[2])) / 30;
  for (let i = 1; i < 4; i++)
    if (ca <= POS_CA_ANCHORS[i])
      return a[i - 1] + ((a[i] - a[i - 1]) * (ca - POS_CA_ANCHORS[i - 1])) / 30;
  return a[3];
}

function projectAttrs(p) {
  if (!p.pa || !p.ca || p.pa <= p.ca || !p.attrs) return null;
  const age = getAge(p);
  // Position profiles are already age-adjusted (CA 180 players are typically about 25).
  // Apply an additional reduction to physical growth only for older players.
  const physF = age == null || age <= 23 ? 1 : physGrowthFactor(age);
  const groups = posGroupsOf(p);
  const keys = Object.keys(p.attrs).filter(
    (k) =>
      !['Consistency', 'ImportantMatches', 'Versatility', 'InjuryProneness', 'Dirtiness'].includes(
        k,
      ),
  );
  const proj = {};
  for (const k of keys) {
    let d = 0,
      n = 0;
    for (const g of groups) {
      const a = POS_ATTR_PROFILE[g][k];
      if (a) {
        d += Math.max(0, posNorm(a, p.pa) - posNorm(a, p.ca));
        n++;
      }
    }
    d = n ? d / n : 0;
    if (PHYS_ATTRS.has(k)) d *= physF;
    proj[k] = Math.min(20, Math.round(p.attrs[k] + d));
  }
  return proj;
}
// Profile view: 'side' = right panel (default), 'popup' = centered modal.
function profMode() {
  return localStorage.getItem('fmss_profmode') || 'side';
}
function closeDetail() {
  $('detail').classList.add('hidden');
  $('detail-backdrop').classList.add('hidden');
  state.selected = null;
  renderVisible();
}
function showDetail(p) {
  state.selected = p;
  renderVisible();
  const pop = profMode() === 'popup';
  $('detail').classList.toggle('popup', pop);
  $('detail-backdrop').classList.toggle('hidden', !pop);
  $('detail').classList.remove('hidden');
  const isPlayer = !!p.attrs;
  const on = state.shortlist.has(p.id);
  const ev = estValue(p);
  const valTxt =
    ev.v == null || ev.v === 0
      ? '–'
      : ev.est
        ? `${fmtMoney(ev.lo)} – ${fmtMoney(ev.hi)}`
        : fmtMoney(ev.v);

  const gauge =
    !state.hideCapa && (p.ca != null || p.pa != null)
      ? `<div class="capa">
    <div class="capa-nums"><span><b>CA</b> <span class="ca-bar">${p.ca ?? '–'}</span></span><span><b>PA</b> <span class="pa-bar">${p.pa ?? '–'}</span></span></div>
    <div class="capa-track"><span class="capa-pa" style="width:${Math.min(100, (p.pa ?? 0) / 2)}%"></span><span class="capa-ca" style="width:${Math.min(100, (p.ca ?? 0) / 2)}%"></span></div>
  </div>`
      : '';
  const inCmp = state.compare.includes(p.id);
  let html = `<h2>${escHtml(p.name)} ${isPlayer ? `<span class="detail-star ${on ? 'on' : ''}" data-star="${p.id}">${starSvg(18)}</span>` : ''}
    <button class="copybtn" title="${text('copyBtnTip')}">${icon('clipboard', 13)}</button>
    <button class="cmpbtn ${inCmp ? 'on' : ''}" title="${text('addCompare')}">${icon('compare', 13)}</button>${isPlayer && p.attrs ? `<button class="cardbtn" title="${text('cardBtnTip')}">${icon('card', 13)}</button>` : ''}</h2>
  <div class="sub">${getAge(p)} · ${escHtml(natsLabel(p))}${isEu(p) ? ' · <span class="eu-yes">EU</span>' : ''} · ${clubLabel(p)}${p.div ? ` · <span class="dim">${escHtml(playerDivisionLabel(p))}</span>` : ''}</div>
  ${gauge}
  <div class="kv">
    ${isPlayer ? `<div><b>${text('c_pos')}</b> ${escHtml(p.pos || '–')}</div><div><b>${text('foot')}</b> ${escHtml(footLabel(p))}</div>` : `<div><b>${text('c_role')}</b> ${escHtml(jobLabel(p))}</div>`}
    <div><b>${text('estval')}</b> ${valTxt}</div>
    ${!state.hideCapa && feeEstimate(p).v > 0 ? `<div><b>${text('c_fee')}</b> ${fmtMoney(feeEstimate(p).v * 0.85)} – ${fmtMoney(feeEstimate(p).v * 1.15)}</div>` : ''}
    <div><b>${text('wageLabel')}</b> ${fmtWage(p.wage)}${p.wage > 0 ? ` <span class="dim">${wageSuf()}</span>` : ''}</div>
    ${p.worldRep ? `<div><b>${text('repLabel')}</b> ${p.worldRep}</div>` : ''}
    <div><b>${text('contractLabel')}</b> ${fmtDate(p.expires)}</div>
    ${p.ownerClub && p.ownerClub !== p.club ? `<div><b>${text('ownerLabel')}</b> ${escHtml(p.ownerClub)}</div>` : ''}
    ${p.height ? `<div><b>${text('height')}</b> ${p.height} cm</div>` : ''}
    ${
      isPlayer && !state.hideMeta && p.attrs
        ? (() => {
            const positions = metaScoresByPosition(p, p.attrs);
            if (!positions.length) return '';
            const paMeta = !state.hideCapa ? metaPaScore(p) : null;
            const bestGroup = positions.length ? positions[0].group : null;
            const paRow =
              paMeta != null
                ? `<div data-help="metaPaHint" style="margin-bottom:2px"><b>${text('c_metapa')}<\/b> <span class="${metaClass(paMeta, bestGroup)}">${fmtMeta(paMeta)}<\/span> <span class="col-help">?<\/span><\/div>`
                : '';
            const td = (a = 'left') => `style="text-align:${a};padding:1px 5px 1px 0"`;
            const th = (a = 'left') =>
              `style="text-align:${a};padding:0 5px 3px 0;opacity:0.5;font-weight:normal"`;
            const rows = positions
              .map(({ pos, group, prof, meta, effectiveMeta }) => {
                const profCell =
                  prof != null
                    ? `<span class="${attrClass(prof)}">${prof}<\/span>`
                    : '<span class="dim">?<\/span>';
                return `<tr><td ${td()}>${pos}<\/td><td ${td('right')}>${profCell}<\/td><td ${td('right')}><span class="${metaClass(meta, group)}">${fmtMeta(meta)}<\/span><\/td><td ${td('right')}><span class="${metaClass(effectiveMeta, group)}">${fmtMeta(effectiveMeta)}<\/span><\/td><\/tr>`;
              })
              .join('');
            return `${paRow}<table data-help="metaHint" style="border-collapse:collapse;width:100%;font-size:0.83em;margin-top:2px"><tr><th ${th()}>Pos<\/th><th ${th('right')}>Prof<\/th><th ${th('right')}>Meta<\/th><th ${th('right')}>Eff<\/th><\/tr>${rows}<\/table>`;
          })()
        : ''
    }
  </div>`;

  const flags = [];
  if (isFree(p)) flags.push(`<span class="pill">${text('tag_free')}</span>`);
  if (p.listed) flags.push(`<span class="pill warn">${text('tag_listed')}</span>`);
  if (p.loanListed) flags.push(`<span class="pill warn">${text('tag_loan')}</span>`);
  if (p.setForRelease) flags.push(`<span class="pill warn">${text('tag_rel')}</span>`);
  if (p.notForSale) flags.push(`<span class="pill">${text('tag_nfs')}</span>`);
  if (isAttainable(p))
    flags.push(`<span class="pill good" data-help="attainHint">${text('attainable')}</span>`);
  if (flags.length) html += '<div>' + flags.join('') + '</div>';

  if (isPlayer) {
    const i = interestEstimate(p);
    if (i)
      html += `<div class="interest-box" data-help="interestHint"><b>${text('interestTitle')}:</b> <span class="int ${i.cls}">${i.label}</span> <span class="dim">(${i.score}/100)</span> <span class="col-help">?</span>${i.note ? `<div class="int-note">${text(i.note === 'minor' ? 'minorNote' : 'minorIntlNote')}</div>` : ''}</div>`;
    html += '<div id="dev-box"></div>'; // development-graph (trends) loads async
  }

  if (isPlayer && p.attrs) {
    // Potential depends on PA, so offer this toggle only when hidden stats are visible.
    const canPot = !state.hideCapa && p.pa > p.ca;
    if (!state.hideCapa)
      html += `<label class="potswitch${canPot ? '' : ' off'}"><input type="checkbox" id="pot-toggle" ${state.showPot ? 'checked' : ''} ${canPot ? '' : 'disabled'}> ${text('showPot')}${state.showPot ? ` <span class="dim">(${text('potNote')})</span>` : ''}</label>`;
    // A player is a "GK" for display purposes only when GK is their natural primary position.
    // posArr includes GK for virtually every FM player (all positions appear at prof=1), so
    // checking posArr would incorrectly show the Goalkeeping panel for all outfield players.
    const isGk = p.pos === 'GK';
    const groups = isGk ? ATTR_GROUPS_GK : ATTR_GROUPS_OUTFIELD;
    const proj = !state.hideCapa && state.showPot ? projectAttrs(p) : null;

    // Meta-contribution indicator: shows (val − baseline) × coeff for the player's best position.
    // Only available when the Direct engine is active (META_PRESET.coeffs != null).
    const metaPositions = metaScoresByPosition(p, p.attrs);
    const bestMetaGroup = metaPositions.length ? metaPositions[0].group : null;
    const gCoeffs = bestMetaGroup && META_PRESET.coeffs ? META_PRESET.coeffs[bestMetaGroup] : null;
    const metaBaseline = META_PRESET.baseline ?? 8;
    const contribSpan = (k, val) => {
      if (!gCoeffs) return '';
      const coeff = gCoeffs[k] ?? 0;
      if (!coeff) return '';
      const c = (val - metaBaseline) * coeff;
      const sign = c >= 0 ? '+' : '';
      const cls = c >= 0 ? 'pos' : 'neg';
      return `<span class="attr-contrib ${cls}">${sign}${c.toFixed(2)}</span>`;
    };

    const col = {};
    for (const [gk, keys] of groups) {
      const rows = sortByLabel(keys).filter((k) => p.attrs[k] != null);
      col[gk] = !rows.length
        ? ''
        : `<div class="attr-col"><h3>${text(gk)}</h3>` +
          rows
            .map((k, idx) => {
              const raw = p.attrs[k];
              const shown = proj ? (proj[k] ?? raw) : raw;
              const grew = state.showPot && shown > raw;
              return `<div class="attr-row ${idx % 2 ? 'odd' : ''}"><span>${attrName(k)}</span>${contribSpan(k, shown)}<span class="v ${attrClass(shown)}${grew ? ' grew' : ''}">${shown}</span></div>`;
            })
            .join('') +
          '</div>';
    }
    // Keep personality values in the same layout as the other attribute groups.
    const pd = [
      ['ambition', p.ambition],
      ['professionalism', p.professionalism],
      ['loyalty', p.loyalty],
      ['pressure', p.pressure],
      ['temperament', p.temperament],
      ['sportsmanship', p.sportsmanship],
      ['adaptability', p.adaptability],
      ['controversy', p.controversy],
    ].filter((x) => x[1] > 0);
    const persHtml = pd.length
      ? `<div class="attr-col"><h3>${text('personaTitle')}</h3>` +
        pd
          .map(
            ([k, v], idx) =>
              `<div class="attr-row ${idx % 2 ? 'odd' : ''}"><span>${text(k)}</span><span class="v ${attrClass(v)}">${v}</span></div>`,
          )
          .join('') +
        '</div>'
      : '';
    // High injury proneness and dirtiness are negative, so invert their color scale.
    // Hidden attrs (Consistency, ImportantMatches, Versatility) can have meta coefficients too.
    const hd = [
      ['Consistency', true],
      ['ImportantMatches', true],
      ['Versatility', true],
      ['InjuryProneness', false],
      ['Dirtiness', false],
    ]
      .map(([k, good]) => [k, p.attrs ? p.attrs[k] : 0, good])
      .filter((x) => x[1] > 0);
    const hidHtml = hd.length
      ? `<div class="attr-col"><h3>${text('hiddenTitle')}</h3>` +
        hd
          .map(([k, v, good], idx) => {
            const cls = good ? attrClass(v) : attrClass(21 - v); // "bad-high": inverted color
            return `<div class="attr-row ${idx % 2 ? 'odd' : ''}"><span>${text('a_' + k)}</span>${contribSpan(k, v)}<span class="v ${cls}">${v}</span></div>`;
          })
          .join('') +
        '</div>'
      : '';
    // Place Technical/Goalkeeping and Set Pieces on the left, Mental in the center,
    // and Physical/Hidden plus Personality along the bottom.
    const techKey = isGk ? 'g_goalkeeping' : 'g_technical';
    html += `<div class="attr-grid">
      <div style="grid-area:tech">${col[techKey] || ''}</div>
      <div style="grid-area:sp">${col['g_setpieces'] || ''}</div>
      <div style="grid-area:ment">${col['g_mental'] || ''}</div>
      <div style="grid-area:phys">${col['g_physical'] || ''}${state.hideCapa ? '' : hidHtml}</div>
      <div style="grid-area:pers">${state.hideCapa ? '' : persHtml}</div>
    </div>`;
  } else if (p.staffAttrs) {
    html +=
      `<div class="attr-cols"><div class="attr-col"><h3>${text('staffAttrs')}</h3>` +
      Object.entries(p.staffAttrs)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([k, v], idx) =>
            `<div class="attr-row ${idx % 2 ? 'odd' : ''}"><span>${staffAttrName(k)}</span><span class="v ${attrClass(v)}">${v}</span></div>`,
        )
        .join('') +
      '</div></div>';
  }
  $('detail-body').innerHTML = html;
  const star = document.querySelector('.detail-star');
  if (star) star.onclick = () => toggleShortlist(p.id);
  document.querySelector('.copybtn').onclick = () => copyName(p.name);
  const cmp = document.querySelector('.cmpbtn');
  if (cmp)
    cmp.onclick = () => {
      toggleCompare(p.id);
      cmp.classList.toggle('on', state.compare.includes(p.id));
    };
  const cb = document.querySelector('.cardbtn');
  if (cb) cb.onclick = () => downloadPlayerCard(p);
  const pt = $('pot-toggle');
  if (pt)
    pt.onchange = () => {
      state.showPot = pt.checked;
      showDetail(p);
    };
  if (isPlayer) renderDevChart(p);
  if (p.id !== state._donLast) {
    state._donLast = p.id;
    bumpStat('fmss_uses');
  } // counter for the seasonal report
}

// ---------- development chart ----------
// Draw up to two history panels: CA/PA and market value. Keep them separate because they use
// different scales. Dots mark saved snapshots; values carry forward between changed snapshots.
async function renderDevChart(p) {
  try {
    const r = await fetch(
      `/api/history/series?uid=${p.id}&manager=${encodeURIComponent(state.meta.manager || 'default')}`,
    );
    if (!r.ok) return;
    const { dates, entries } = await r.json();
    const box = $('dev-box');
    if (!box || state.selected !== p) return; // user already clicked through
    // Reconstruct series: enter each date from the first measurement point (carry-forward).
    const pts = [];
    let cur = null;
    for (const d of dates) {
      const e = entries[d];
      if (e) cur = e;
      if (cur) pts.push({ d, ca: cur[0], pa: cur[1], v: cur[2], real: !!e });
    }
    if (pts.length < 2) return;
    const panels = [];
    if (!state.hideCapa) panels.push(devPanel(pts, 'capa'));
    if (pts.some((q) => q.v > 0)) panels.push(devPanel(pts, 'value'));
    if (!panels.length) return;
    box.innerHTML = `<div class="attr-col dev-col"><h3>${text('devTitle')}</h3><div class="dev-wrap">${panels.join('')}</div></div>`;
  } catch {
    /* no history available */
  }
}

function devPanel(pts, kind) {
  // Reserve room for y-axis labels on the left and CA/PA labels on the right.
  const W = 200,
    H = 84,
    padL = kind === 'capa' ? 26 : 36,
    padR = kind === 'capa' ? 24 : 8,
    padT = 11,
    padB = 14;
  const n = pts.length;
  const x = (i) => padL + (W - padL - padR) * (n === 1 ? 0.5 : i / (n - 1));
  const series =
    kind === 'capa'
      ? [
          { get: (q) => q.ca, cls: 'dvl-ca', dash: '', label: 'CA' },
          { get: (q) => q.pa, cls: 'dvl-pa', dash: '4 3', label: 'PA' },
        ]
      : [{ get: (q) => q.v, cls: 'dvl-v', dash: '', label: '' }];
  const all = pts.flatMap((q) => series.map((s) => s.get(q))).filter((v) => v != null && v > 0);
  // Preserve the actual data extremes for labels; axis padding must not imply a value absent
  // from the series.
  const loReal = Math.min(...all),
    hiReal = Math.max(...all);
  let lo = loReal,
    hi = hiReal;
  // Set a minimum axis span so small changes do not look like steep jumps.
  // CA/PA spans at least 12 points; value spans at least 12% around its center.
  const midV = (lo + hi) / 2;
  const minSpan = kind === 'capa' ? 12 : Math.max(1, midV * 0.12);
  if (hi - lo < minSpan) {
    lo = midV - minSpan / 2;
    hi = midV + minSpan / 2;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const fmtV = (v) => (kind === 'capa' ? Math.round(v) : fmtMoney(v));
  const fmtD = (d) => `${d.slice(5, 7)}-'${d.slice(2, 4)}`;

  let g = '';
  // Draw the baseline and min/max labels in a neutral color.
  g += `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" class="dv-axis"/>`;
  // Labels on the real extreme values, not on the stretched axis edges.
  g += `<text x="${padL - 3}" y="${(y(hiReal) + 3).toFixed(1)}" class="dv-lbl" text-anchor="end">${fmtV(hiReal)}</text>`;
  if (Math.abs(y(loReal) - y(hiReal)) > 10)
    g += `<text x="${padL - 3}" y="${(y(loReal) + 3).toFixed(1)}" class="dv-lbl" text-anchor="end">${fmtV(loReal)}</text>`;
  g += `<text x="${padL}" y="${H - 3}" class="dv-lbl">${fmtD(pts[0].d)}</text>`;
  g += `<text x="${W - padR}" y="${H - 3}" class="dv-lbl" text-anchor="end">${fmtD(pts[n - 1].d)}</text>`;
  const endLbls = [];
  for (const s of series) {
    // null-safe path: missing values break the line instead of diving to the bottom
    let path = '',
      pen = false,
      lastY = null;
    pts.forEach((q, i) => {
      const v = s.get(q);
      if (v == null || v <= 0) {
        pen = false;
        return;
      }
      path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
      lastY = y(v);
      if (q.real)
        g += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2" class="dvd ${s.cls}"/>`;
    });
    g += `<path d="${path}" class="dvl ${s.cls}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`;
    if (s.label && lastY != null) endLbls.push({ txt: s.label, y: lastY + 3 });
  }
  // Separate the CA/PA end labels when the lines nearly overlap; color and line style
  // are not enough to distinguish labels that occupy the same space.
  if (endLbls.length === 2 && Math.abs(endLbls[0].y - endLbls[1].y) < 11) {
    const mid = (endLbls[0].y + endLbls[1].y) / 2;
    const [a, b] = endLbls[0].y <= endLbls[1].y ? endLbls : [endLbls[1], endLbls[0]];
    a.y = mid - 5.5;
    b.y = mid + 5.5;
  }
  for (const l of endLbls)
    g += `<text x="${W - padR + 3}" y="${l.y.toFixed(1)}" class="dv-lbl">${l.txt}</text>`;
  // Use full-height hover targets with a tooltip for each dump date.
  // Include PA in the tooltip only when it changes during this history.
  const paVaries = kind === 'capa' && new Set(pts.map((q) => q.pa)).size > 1;
  const seg = (W - padL - padR) / Math.max(1, n - 1);
  pts.forEach((q, i) => {
    const tip =
      kind === 'capa'
        ? `${fmtDate(q.d)} · CA ${q.ca}${paVaries ? ` · PA ${q.pa}` : ''}`
        : `${fmtDate(q.d)} · ${q.v > 0 ? fmtMoney(q.v) : '–'}`;
    g += `<rect x="${(x(i) - seg / 2).toFixed(1)}" y="0" width="${seg.toFixed(1)}" height="${H}" class="dv-hit" data-tip="${escHtml(tip)}"/>`;
  });
  // Change over the displayed window, in the panel header: green up, red down.
  const main = series[0];
  const vals = pts.map(main.get).filter((v) => v != null && v > 0);
  let delta = '';
  if (vals.length > 1) {
    const dv = vals[vals.length - 1] - vals[0];
    if (dv !== 0) {
      const sign = dv > 0 ? '+' : '−';
      const txt = kind === 'capa' ? sign + Math.abs(Math.round(dv)) : sign + fmtMoney(Math.abs(dv));
      delta = `<span class="dev-delta ${dv > 0 ? 'up' : 'down'}" data-help="devDeltaHint">${txt}</span>`;
    }
  }
  const cap = kind === 'capa' ? 'CA / PA' : text('cmpValue');
  return `<div class="dev-panel"><div class="dev-cap">${cap}${delta}</div><svg viewBox="0 0 ${W} ${H}">${g}</svg></div>`;
}

// ---------- shareable player card (PNG) ----------
// Follow FM card conventions so the grid, stars, roles, and finances scan quickly.
// Card accents follow CA; wonderkids receive a gold badge. Keep card-only labels together.
const CARDL = {
  meta: 'META',
  cur: 'CURRENT',
  pot: 'POTENTIAL',
  roles: 'TOP ROLES',
  value: 'VALUE',
  ask: 'ASKING PRICE',
  wage: 'WAGE',
  contract: 'CONTRACT',
  rep: 'Reputation',
  inj: 'Injury',
  wk: '★ WONDERKID',
  repW: 'Worldwide',
  repC: 'Continental',
  repN: 'National',
  repL: 'Local',
  injL: 'Low',
  injM: 'Medium',
  injH: 'High',
  sListed: 'TRANSFER LISTED',
  sLoan: 'FOR LOAN',
  sRel: 'RELEASED',
  sNfs: 'NOT FOR SALE',
  sFree: 'FREE AGENT',
};
// Match FM's attribute grouping by combining Set Pieces with Technical on the shareable card.
function cardGroups(p, isGk) {
  const a = p.attrs || {};
  // > 0: FM attributes range 1-20; 0 means "not in the dump" and does not belong on the map.
  const pick = (keys) =>
    sortByLabel(keys)
      .filter((k) => a[k] > 0)
      .map((k) => [attrName(k), a[k]]);
  return isGk
    ? [
        [text('g_goalkeeping'), pick(ATTR_GROUPS_GK[0][1])],
        [text('g_mental'), pick(ATTR_GROUPS_GK[1][1])],
        [text('g_physical'), pick(ATTR_GROUPS_GK[2][1])],
      ]
    : [
        [text('g_technical'), pick([...ATTR_GROUPS_OUTFIELD[0][1], ...ATTR_GROUPS_OUTFIELD[3][1]])],
        [text('g_mental'), pick(ATTR_GROUPS_OUTFIELD[1][1])],
        [text('g_physical'), pick(ATTR_GROUPS_OUTFIELD[2][1])],
      ];
}

// Builds the card model from a real player (all derived values and labels).
function buildCardModel(p) {
  const L = CARDL;
  const isGk = (p.posArr || []).includes('GK');
  const meta = metaScore(p);
  const ca = p.ca || 0,
    pa = p.pa || 0;
  const wk = isWonderkid(p);
  const tier = wk ? 'gold' : ca >= 150 ? 'elite' : ca >= 115 ? 'strong' : 'neutral';

  const st = isFree(p)
    ? { t: L.sFree, c: '#8294a8' }
    : p.notForSale
      ? { t: L.sNfs, c: '#8294a8' }
      : p.setForRelease
        ? { t: L.sRel, c: '#e06060' }
        : p.listed
          ? { t: L.sListed, c: '#e8a13c' }
          : p.loanListed
            ? { t: L.sLoan, c: '#4aa3ff' }
            : null;

  const wr = p.worldRep || 0;
  const rep = wr >= 6500 ? L.repW : wr >= 4500 ? L.repC : wr >= 2500 ? L.repN : L.repL;
  const ip = p.attrs ? p.attrs.InjuryProneness : 0;
  const injury =
    ip > 0
      ? ip >= 14
        ? { t: L.injH, c: '#e06060' }
        : ip >= 8
          ? { t: L.injM, c: '#e8a13c' }
          : { t: L.injL, c: '#46c46e' }
      : null;

  const ev = estValue(p);
  const fee = feeEstimate(p);
  // Keep scout stars visible when hidden stats are enabled, but hide raw CA/PA numbers
  // and the asking price estimate derived from them.
  const hideNum = state.hideCapa;
  const ask = !hideNum && fee.v > 0 ? `${fmtMoney(fee.v * 0.85)}–${fmtMoney(fee.v * 1.15)}` : '–';
  const roles = bestRoles(p, 2).map((r) => [roleName(r.id), r.score]);
  const snapDate = state.meta.gameDate ? fmtDate(state.meta.gameDate) : '';

  return {
    L,
    tier,
    wk,
    gk: isGk,
    name: (p.name || '?').toUpperCase(),
    club: p.club || L.sFree,
    division: playerDivisionLabel(p),
    nation: natsLabel(p) || '',
    positions: (p.posArr || []).slice(0, 3).join(' · ') || '–',
    age: getAge(p),
    foot: footLabel(p),
    height: p.height ? p.height + ' cm' : '–',
    ca,
    pa,
    hideNum,
    hexNum: state.hideMeta ? null : meta != null ? fmtMeta(meta) : '–',
    groups: cardGroups(p, isGk),
    roles,
    value: ev.v > 0 ? (ev.est ? '~' : '') + fmtMoney(ev.v) : '–',
    ask,
    wage: p.wage > 0 ? fmtWage(p.wage) + ' ' + wageSuf() : '–',
    contract: fmtDate(p.expires) || '–',
    status: st,
    rep,
    injury,
    snap: 'FM24' + (snapDate ? ' · ' + snapDate : ''),
  };
}

const CARD_TIER = {
  elite: '#46c46e',
  strong: '#4aa3ff',
  neutral: '#aeb9c6',
  gold: '#f5c518',
};
const cardFmc = (v) => (v >= 16 ? '#46c46e' : v >= 11 ? '#e8a13c' : '#aeb9c6');
function cardAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawPlayerCard(p) {
  const d = buildCardModel(p);
  const cv = document.createElement('canvas');
  cv.width = 1200;
  cv.height = 1600;
  const x = cv.getContext('2d');
  const W = 600,
    H = 800,
    g = 1;
  const P = {
    bg2: '#1c242f',
    bd: '#2a3441',
    tx: '#dbe4ee',
    mu: '#8294a8',
    gr: '#46c46e',
    am: '#e8a13c',
    gd: '#f5c518',
  };
  const T = CARD_TIER[d.tier],
    wk = d.wk;
  const A = cardAlpha,
    fmc = cardFmc;
  const F = (w, s) => `${w} ${s}px "Segoe UI", system-ui, sans-serif`;
  const ls = (v) => {
    try {
      x.letterSpacing = v;
    } catch (e) {}
  };
  const rr = (a, b, w, h, r) => {
    x.beginPath();
    x.roundRect(a, b, w, h, r);
  };
  const hexPath = (cx, cy, r) => {
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3,
        px = cx + Math.cos(a) * r,
        py = cy + Math.sin(a) * r;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath();
  };
  const cham = (i, c, col, lw) => {
    x.beginPath();
    x.moveTo(i + c, i);
    x.lineTo(W - i - c, i);
    x.lineTo(W - i, i + c);
    x.lineTo(W - i, H - i - c);
    x.lineTo(W - i - c, H - i);
    x.lineTo(i + c, H - i);
    x.lineTo(i, H - i - c);
    x.lineTo(i, i + c);
    x.closePath();
    x.strokeStyle = col;
    x.lineWidth = lw;
    x.stroke();
  };
  const fit = (s, maxW, size, min, w) => {
    x.font = F(w, size);
    while (size > min && x.measureText(s).width > maxW) {
      size -= 1;
      x.font = F(w, size);
    }
    return size;
  };
  const trunc = (s, maxW) => {
    if (x.measureText(s).width <= maxW) return s;
    while (s.length > 2 && x.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  };
  const chipAt = (cx0, y0, text, col) => {
    x.font = F(800, 10.5);
    ls('1px');
    const w = x.measureText(text).width + 24;
    rr(cx0, y0, w, 24, 12);
    x.fillStyle = A(col, 0.12);
    x.fill();
    x.strokeStyle = A(col, 0.55);
    x.lineWidth = 1.25;
    rr(cx0, y0, w, 24, 12);
    x.stroke();
    x.fillStyle = col;
    x.textAlign = 'left';
    x.fillText(text, cx0 + 12, y0 + 16.5);
    ls('0px');
    return w;
  };
  // 5-point star with fractional fill (half stars, like FM scout reports).
  const starPath = (cx, cy, r) => {
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5,
        rr2 = i % 2 ? r * 0.47 : r;
      const px = cx + Math.cos(a) * rr2,
        py = cy + Math.sin(a) * rr2;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath();
  };
  const starRow = (x0, cy, r, step, val, fillCol, fillA) => {
    for (let i = 0; i < 5; i++) {
      const cx0 = x0 + i * step;
      const f = Math.max(0, Math.min(1, val - i));
      const frac = f >= 0.75 ? 1 : f >= 0.25 ? 0.5 : 0;
      starPath(cx0, cy, r);
      x.fillStyle = A('#0b0f14', 0.5);
      x.fill();
      x.strokeStyle = A(fillCol, 0.45);
      x.lineWidth = 1.25;
      x.stroke();
      if (frac > 0) {
        x.save();
        starPath(cx0, cy, r);
        x.clip();
        x.fillStyle = A(fillCol, fillA);
        x.fillRect(cx0 - r, cy - r, 2 * r * frac, 2 * r);
        x.restore();
        starPath(cx0, cy, r);
        x.strokeStyle = A(fillCol, 0.9);
        x.stroke();
      }
    }
  };

  x.setTransform(2, 0, 0, 2, 0, 0);
  x.clearRect(0, 0, W, H);
  x.textBaseline = 'alphabetic';
  x.save();
  rr(0, 0, W, H, 20);
  x.clip();
  let bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1c242f');
  bg.addColorStop(0.45, '#151b24');
  bg.addColorStop(1, '#0e1218');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);
  let rg = x.createRadialGradient(300, 180, 0, 300, 180, 420);
  rg.addColorStop(0, A(T, d.tier === 'neutral' ? 0.08 : 0.13));
  rg.addColorStop(1, A(T, 0));
  x.fillStyle = rg;
  x.fillRect(0, 0, W, H);
  if (wk) {
    x.save();
    x.translate(300, 400);
    x.rotate(-0.42);
    x.fillStyle = A(P.gd, 0.04);
    x.fillRect(-150, -620, 110, 1240);
    x.fillStyle = A(P.gd, 0.03);
    x.fillRect(10, -620, 34, 1240);
    x.restore();
  }
  let tb = x.createLinearGradient(0, 0, W, 0);
  tb.addColorStop(0, A(T, 0));
  tb.addColorStop(0.12, A(T, 0.95));
  tb.addColorStop(0.88, A(T, 0.95));
  tb.addColorStop(1, A(T, 0));
  x.shadowColor = A(T, 0.6 * g);
  x.shadowBlur = 16 * g;
  x.fillStyle = tb;
  x.fillRect(0, 0, W, 5);
  x.shadowBlur = 0;
  cham(12, 18, A(T, 0.3), 1.25);
  if (wk) cham(17, 24, A(P.gd, 0.15), 1);

  // ----- header: identity left, bio right -----
  x.textAlign = 'left';
  const ns = fit(d.name, 386, 34, 21, 800);
  x.font = F(800, ns);
  x.fillStyle = P.tx;
  ls('-0.5px');
  x.fillText(d.name, 28, 66);
  ls('0px');
  x.font = F(700, 14);
  x.fillStyle = A(P.tx, 0.92);
  x.fillText(trunc(d.club, 386), 28, 92);
  x.font = F(600, 11);
  x.fillStyle = P.mu;
  x.fillText(trunc(d.division, 386), 28, 110);
  x.textAlign = 'right';
  x.font = F(800, 19);
  x.fillStyle = P.tx;
  x.fillText(d.positions, 572, 52);
  x.font = F(600, 12);
  x.fillStyle = P.mu;
  x.fillText(`${d.age} · ${d.foot} · ${d.height}`, 572, 72);
  x.font = F(600, 11);
  x.fillStyle = A(P.mu, 0.85);
  x.fillText(trunc(d.nation, 190), 572, 90);
  if (wk) {
    x.font = F(800, 10.5);
    const ww = x.measureText(d.L.wk).width + 24;
    chipAt(572 - ww, 100, d.L.wk, P.gd);
  }

  // ----- star panel: scout stars (current/potential) + meta hex chip -----
  rr(24, 132, 552, 86, 12);
  x.fillStyle = A(P.bg2, 0.5);
  x.fill();
  x.strokeStyle = A(P.bd, 0.7);
  x.lineWidth = 1;
  rr(24, 132, 552, 86, 12);
  x.stroke();
  const srLab = (tt, y) => {
    x.font = F(700, 9);
    ls('1.5px');
    x.fillStyle = P.mu;
    x.textAlign = 'left';
    x.fillText(tt, 42, y);
    ls('0px');
  };
  srLab(d.L.cur, 164);
  srLab(d.L.pot, 199);
  starRow(146, 160, 12, 29, d.ca / 40, P.gd, 0.95);
  starRow(146, 195, 12, 29, d.pa / 40, P.gd, 0.45);
  if (!d.hideNum) {
    x.textAlign = 'left';
    x.font = F(800, 17);
    x.fillStyle = T;
    x.fillText(String(d.ca), 292, 166);
    let cw = x.measureText(String(d.ca)).width;
    x.font = F(700, 10);
    x.fillStyle = P.mu;
    x.fillText('CA', 292 + cw + 5, 166);
    x.font = F(800, 17);
    x.fillStyle = wk ? P.gd : P.tx;
    x.fillText(String(d.pa), 292, 201);
    cw = x.measureText(String(d.pa)).width;
    x.font = F(700, 10);
    x.fillStyle = P.mu;
    x.fillText('PA', 292 + cw + 5, 201);
  }
  // meta-hex chip (FMSS signature); expires if the meta-toggle is off
  if (d.hexNum !== null) {
    hexPath(512, 175, 33);
    x.fillStyle = P.bg2;
    x.shadowColor = A(T, 0.5 * g);
    x.shadowBlur = 14 * g;
    x.fill();
    x.shadowBlur = 0;
    x.strokeStyle = A(T, 0.9);
    x.lineWidth = 1.5;
    x.stroke();
    hexPath(512, 175, 27);
    x.strokeStyle = A(T, 0.22);
    x.lineWidth = 1;
    x.stroke();
    x.textAlign = 'center';
    x.fillStyle = T;
    x.font = F(800, 20);
    x.fillText(d.hexNum, 512, 181);
    x.font = F(700, 7.5);
    x.fillStyle = P.mu;
    ls('1.5px');
    x.fillText(d.L.meta, 512, 195);
    ls('0px');
  }

  // ----- attribute grid: 3 columns in FM colors, zebra rows, chips for 16+ -----
  const cols = [24, 216, 408],
    colW = 168,
    rowH = 20,
    rowY0 = 280;
  const gridHead = (tt, x0, y0) => {
    x.font = F(800, 10);
    ls('1.5px');
    x.fillStyle = P.mu;
    x.textAlign = 'left';
    x.fillText(tt.toUpperCase(), x0, y0);
    ls('0px');
    rr(x0, y0 + 8, colW, 2, 1);
    x.fillStyle = A(T, 0.5);
    x.fill();
  };
  d.groups.forEach((grp, gi) => {
    const x0 = cols[gi];
    gridHead(grp[0], x0, 250);
    grp[1].forEach(([nm, v], idx) => {
      const ry = rowY0 + idx * rowH;
      if (idx % 2 === 0) {
        rr(x0 - 6, ry - 14, colW + 12, 19, 4);
        x.fillStyle = A('#0b0f14', 0.35);
        x.fill();
      }
      // Shrink long labels such as "Control of penalty area" before truncating them.
      x.textAlign = 'left';
      const lsz = fit(nm, colW - 36, 10.5, 8.5, 600);
      x.font = F(600, lsz);
      x.fillStyle = A(P.tx, 0.72);
      x.fillText(trunc(nm, colW - 36), x0, ry);
      const vx = x0 + colW;
      if (v >= 16) {
        rr(vx - 28, ry - 13.5, 31, 18, 5);
        x.fillStyle = A(P.gr, v >= 18 ? 0.3 : 0.17);
        x.fill();
        if (v >= 18) {
          x.strokeStyle = A(P.gr, 0.5);
          x.lineWidth = 1;
          rr(vx - 28, ry - 13.5, 31, 18, 5);
          x.stroke();
        }
        x.textAlign = 'right';
        x.font = F(800, 12.5);
        x.fillStyle = v >= 18 ? '#7ee2a0' : P.gr;
        x.fillText(String(v), vx - 5, ry);
      } else {
        x.textAlign = 'right';
        x.font = F(v >= 11 ? 700 : 600, 12);
        x.fillStyle = v >= 11 ? P.am : A(P.mu, 0.95);
        x.fillText(String(v), vx - 5, ry);
      }
    });
  });

  // ----- best roles: under Physical in column 3 -----
  const rx = cols[2],
    physRows = d.groups[2][1].length;
  const rolesY = rowY0 + physRows * rowH + 18;
  gridHead(d.L.roles, rx, rolesY);
  d.roles.forEach((r, i) => {
    const yy = rolesY + 32 + i * 38;
    x.textAlign = 'left';
    const rsz = fit(r[0], colW - 38, 11.5, 9, 700);
    x.font = F(700, rsz);
    x.fillStyle = P.tx;
    x.fillText(trunc(r[0], colW - 38), rx, yy);
    x.textAlign = 'right';
    x.font = F(800, 13);
    x.fillStyle = fmc(r[1]);
    x.fillText(r[1].toFixed(1), rx + colW, yy);
    rr(rx, yy + 7, colW, 4, 2);
    x.fillStyle = A(P.bd, 0.8);
    x.fill();
    rr(rx, yy + 7, (colW * Math.min(20, r[1])) / 20, 4, 2);
    x.fillStyle = fmc(r[1]);
    x.fill();
  });

  // ----- finances + status/reputation/injuries -----
  rr(24, 564, 552, 104, 12);
  x.fillStyle = A(P.bg2, 0.35);
  x.fill();
  x.strokeStyle = A(P.bd, 0.7);
  x.lineWidth = 1;
  rr(24, 564, 552, 104, 12);
  x.stroke();
  const fx = [44, 180, 316, 452],
    flab = [d.L.value, d.L.ask, d.L.wage, d.L.contract],
    fval = [d.value, d.ask, d.wage, d.contract];
  x.textAlign = 'left';
  flab.forEach((l, i) => {
    x.font = F(700, 9.5);
    ls('1.5px');
    x.fillStyle = P.mu;
    x.fillText(l, fx[i], 590);
    ls('0px');
    const vs = fit(fval[i], 126, i === 0 ? 18 : 15, 11, 800);
    x.font = F(800, vs);
    x.fillStyle = i === 0 ? T : P.tx;
    x.fillText(fval[i], fx[i], 616);
  });
  x.strokeStyle = A(P.bd, 0.5);
  x.beginPath();
  x.moveTo(44, 632);
  x.lineTo(556, 632);
  x.stroke();
  x.font = F(600, 11.5);
  x.fillStyle = P.mu;
  x.textAlign = 'left';
  x.fillText(d.L.rep + ' · ' + d.rep, 44, 654);
  if (d.status) {
    x.font = F(800, 10.5);
    const sw = x.measureText(d.status.t).width + 24;
    chipAt(300 - sw / 2, 636, d.status.t, d.status.c);
  }
  if (d.injury) {
    x.font = F(700, 11.5);
    const iw = x.measureText(d.injury.t).width;
    x.fillStyle = d.injury.c;
    x.textAlign = 'right';
    x.fillText(d.injury.t, 556, 654);
    x.font = F(600, 11.5);
    x.fillStyle = P.mu;
    x.fillText(d.L.inj + ' ·', 556 - iw - 6, 654);
  }

  // ----- footer -----
  x.strokeStyle = A(P.bd, 0.7);
  x.beginPath();
  x.moveTo(40, 700);
  x.lineTo(560, 700);
  x.stroke();
  x.textAlign = 'left';
  x.font = F(600, 12);
  x.fillStyle = P.mu;
  x.fillText(d.snap, 40, 738);
  x.font = F(800, 19);
  const w1 = x.measureText('FM').width,
    w2 = x.measureText('Super').width,
    w3 = x.measureText('Scout').width;
  let sx = 562 - (w1 + w2 + w3);
  hexPath(sx - 16, 733, 7);
  x.fillStyle = A(T, 0.9);
  x.fill();
  x.fillStyle = P.tx;
  x.fillText('FM', sx, 739);
  x.fillStyle = P.gr;
  x.fillText('Super', sx + w1, 739);
  x.fillStyle = P.tx;
  x.fillText('Scout', sx + w1 + w2, 739);
  x.restore();

  // borders
  x.strokeStyle = A(T, 0.95);
  x.lineWidth = 2.5;
  x.shadowColor = A(T, 0.55 * g);
  x.shadowBlur = 18 * g;
  rr(1.5, 1.5, 597, 797, 19);
  x.stroke();
  x.shadowBlur = 0;
  x.strokeStyle = A(P.bd, 0.9);
  x.lineWidth = 1;
  rr(6.5, 6.5, 587, 787, 15);
  x.stroke();
  return cv;
}

function downloadPlayerCard(p) {
  try {
    drawPlayerCard(p).toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `fmss-${(p.name || 'player')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
    showToast(text('cardSaved'), 'check');
    bumpStat('fmss_cards'); // counter for the seasonal report
    coffeeGlow(); // just delivered something: a soft moment of value
  } catch {
    showToast('!');
  }
}
