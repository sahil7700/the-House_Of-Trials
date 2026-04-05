import { calculateA3 } from './src/app/api/game/calculate/calculators';

const submissions = [
  { id: "u1", playerId: "u1", slotNumber: 2, value: 50 },
  { id: "u2", playerId: "u2", slotNumber: 2, value: 30 },
  { id: "u3", playerId: "u3", slotNumber: 2, value: 80 }
];

const config: any = { config: { gameSpecificConfig: {} } };

const result = calculateA3(submissions, config);
console.log(JSON.stringify(result, null, 2));
