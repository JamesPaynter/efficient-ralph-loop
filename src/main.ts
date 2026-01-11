import { main } from "./index.js";

export { main };

// Allow `node dist/src/main.js` direct execution (legacy entrypoint)
if (import.meta.url === `file://${process.argv[1]}`) {
  void main(process.argv);
}
