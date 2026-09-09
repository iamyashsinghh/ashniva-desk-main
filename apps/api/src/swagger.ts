import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppConfigService } from './config/app-config.service';

export const SWAGGER_PATH = 'api/docs';

/**
 * Serves the API documentation, unless the configuration says not to.
 *
 * Gated rather than authenticated. The document is a complete map of the endpoint surface and
 * every DTO shape — which fields exist, which are optional, which enum values are accepted — and
 * that is reconnaissance, not a secret worth a login screen of its own. Somebody who needs it in
 * production can set `API_DOCS_ENABLED=true` and own the decision; the default answer for a
 * production deployment is that it is not served at all.
 */
export function setupSwagger(app: INestApplication): void {
  if (!app.get(AppConfigService).apiDocsEnabled) {
    return;
  }

  const documentConfig = new DocumentBuilder()
    .setTitle('Ashniva Desk API')
    .setDescription('IT project, task, ticket, contract, client support, IVR and work tracking.')
    .setVersion('1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, documentConfig);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}/json`,
  });
}
