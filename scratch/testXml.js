import { XMLParser } from 'fast-xml-parser';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const xml = `<Mark MarkName="Quarter 1" CalculatedScoreRaw="0" />`;
console.log(parser.parse(xml));
