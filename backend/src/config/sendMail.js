import {createTransport} from 'nodemailer';
import { email } from 'zod';

const sendMail = async({email , subject  , html ,text}) => {

    //create trasnport from nodemailer
    
    const transport = createTransport({
        host: "smtp.gmail.com",
        port:465,
        auth:{
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    })

    //SEND MAIL

    await transport.sendMail({
        from : process.env.EMAIL_USER,
        to : email,
        subject : subject,
        html : html,
        text : text
    })
}

export default sendMail;