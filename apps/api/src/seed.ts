import { migrate, db } from "./db.js";

await migrate();
const cardNames = [
  "Luke Skywalker",
  "Darth Vader",
  "Leia Organa",
  "Han Solo",
  "Chewbacca",
  "Obi-Wan Kenobi",
  "Emperor Palpatine",
  "Boba Fett",
  "Ahsoka Tano",
  "Yoda",
  "Mace Windu",
  "Grand Moff Tarkin",
  "Sabine Wren",
  "The Mandalorian",
  "Grogu",
  "Kylo Ren",
  "Rey",
  "Finn",
  "Jyn Erso",
  "Cassian Andor",
];
await db.batch(
  cardNames.map((name) => ({
    sql: `INSERT INTO cards (id,name) VALUES (?,?) ON CONFLICT(id) DO NOTHING`,
    args: [name.toLowerCase().replaceAll(" ", "-"), name],
  })),
  "write",
);
console.log("Schema and starter card catalog are ready.");
db.close();
