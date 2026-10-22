// Operator-only utility. No credentials, recipient addresses or message content are printed.
import { getTwilioEmailOperation, readTwilioEmailConfig, sendTwilioEmail } from '../lib/email/twilio-email.ts';

const args=process.argv.slice(2);
const config=readTwilioEmailConfig(process.env);
let result;
if(args.length===1&&args[0]==='--check-config') {
  result={ok:!!config,provider:'twilio_email',configured:!!config};
} else if(args.length===2&&args[0]==='--status') {
  result=await getTwilioEmailOperation(config,args[1]);
} else if(args.length===3&&args[0]==='--send'&&args[1]==='--to') {
  result=await sendTwilioEmail(config,{to:args[2],subject:'TXKPRO Twilio Email test',html:'<p>This is a TXKPRO email delivery test.</p>',text:'This is a TXKPRO email delivery test.'});
} else {
  result={ok:false,outcome:'usage',usage:'--check-config | --send --to <recipient> | --status <operationId>'};
}
console.log(JSON.stringify(result));
if(!result.ok)process.exitCode=1;
