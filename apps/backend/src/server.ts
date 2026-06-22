import { env } from './config/env';
import { app } from './app';
import { whatsappService } from './services/whatsapp.service';

app.listen(env.PORT, () => {
  console.log(`AGENTE MOBI — API em http://0.0.0.0:${env.PORT}`);
  void whatsappService.start();
});
