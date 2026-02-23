import { BrowserWindow } from "electrobun/bun";

const win = new BrowserWindow({
  title: "BlockDev",
  url: "views://mainview/index.html",
  frame: {
    width: 1200,
    height: 800,
    x: 200,
    y: 200,
  },
});
