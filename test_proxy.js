const http = require('http');

async function testDelete() {
    const req = await fetch('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'select',
            payload: 'Project_ID, Employee_ID, Animator, Status',
            match: { Project_ID: '21218_1246_her' },
            isMatch: { Employee_ID: null },
        })
    });
    const data = await req.json();
    console.log(JSON.stringify(data, null, 2));
}

testDelete();
