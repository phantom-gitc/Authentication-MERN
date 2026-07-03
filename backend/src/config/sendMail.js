import {createTransport} from 'nodemailer';
import { EMAIL_PASS, EMAIL_USER } from "./env.config.js";


const sendMail = async({email , subject  , html ,text}) => {

    //create trasnport from nodemailer
    
    const transport = createTransport({
        host: "smtp.gmail.com",
        port:465,
        secure: true,
        auth:{
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    })

    //SEND MAIL

    await transport.sendMail({
        from : EMAIL_USER,
        to : email,
        subject : subject,
        html : html,
        text : text
    })
}

export default sendMail;
