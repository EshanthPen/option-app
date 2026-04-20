import { parseStudentVueGradebook } from '../src/utils/studentVueParser.js';
import fs from 'fs';

const xml = `
<ProcessWebServiceRequestResult>
    <Gradebook>
        <Courses>
            <Course Title="Calculus" ClassID="1" Period="1" Staff="Mr. Math" Room="101">
                <Marks>
                    <Mark MarkName="Quarter 1" CalculatedScoreRaw="0">
                        <Assignments>
                            <Assignment GradebookID="1" Measure="Test 1" Points="90 / 100" Score="90" Date="10/01/2026" Type="Summative" />
                        </Assignments>
                    </Mark>
                </Marks>
            </Course>
        </Courses>
    </Gradebook>
</ProcessWebServiceRequestResult>
`;

console.log(JSON.stringify(parseStudentVueGradebook(xml), null, 2));
