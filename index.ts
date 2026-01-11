import { main } from "./src/index.js";

export { main };

// Allow `node dist/index.js` direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  void main(process.argv);
}
