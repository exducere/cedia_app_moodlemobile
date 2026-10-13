# Guía: Crear un nuevo Page/Tab en el Navbar

Esta guía documenta cómo agregar un nuevo tab al navbar principal de la aplicación Moodle Mobile. Se basa en la implementación del tab **User Profile** y proporciona un ejemplo completo para crear un nuevo tab llamado **Game**.

---

## Tabla de Contenidos

1. [Arquitectura del Navbar](#arquitectura-del-navbar)
2. [Caso de Estudio: User Profile](#caso-de-estudio-user-profile)
3. [Ejemplo Práctico: Crear Tab "Game"](#ejemplo-práctico-crear-tab-game)
4. [Referencia de Prioridades](#referencia-de-prioridades)
5. [Troubleshooting](#troubleshooting)

---

## Arquitectura del Navbar

El navbar de Moodle Mobile usa un sistema de **delegates y handlers**. Para que un tab aparezca, necesitas:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NAVBAR SYSTEM                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    registra    ┌─────────────────────────┐   │
│  │  MainMenu        │ ◄───────────── │  Tu Handler             │   │
│  │  Delegate        │                │  (implementa            │   │
│  │                  │                │   CoreMainMenuHandler)  │   │
│  └────────┬─────────┘                └─────────────────────────┘   │
│           │                                                         │
│           │ getHandlersToDisplay()                                  │
│           ▼                                                         │
│  ┌──────────────────┐                                              │
│  │  Para cada       │                                              │
│  │  handler:        │                                              │
│  │  - isEnabled()   │──► false? → No mostrar                       │
│  │  - getDisplay    │                                              │
│  │    Data()        │──► { icon, title, page, priority }           │
│  └────────┬─────────┘                                              │
│           │                                                         │
│           │ ordena por priority                                     │
│           ▼                                                         │
│  ┌──────────────────┐                                              │
│  │  NAVBAR          │                                              │
│  │  [Tab1][Tab2]... │                                              │
│  └──────────────────┘                                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Componentes necesarios

| Componente | Propósito |
|------------|-----------|
| **Constante de ruta** | Define el segmento de URL (`/main/{nombre}`) |
| **MainMenu Handler** | Le dice al navbar "existo" y proporciona icon, título, prioridad |
| **Lazy Module** | Define las rutas internas del tab (qué página cargar) |
| **Feature Module** | Registra todo en Angular y en el delegate |
| **Page Component** | El contenido visual del tab |

---

## Caso de Estudio: User Profile

### Estructura de archivos creados/modificados

```
src/core/features/user/
├── constants.ts                          # Constante CORE_USER_PROFILE_PAGE_NAME
├── user.module.ts                        # Registro de rutas y handler
├── user-lazy.module.ts                   # [NUEVO] Lazy module del tab
├── services/
│   └── handlers/
│       └── mainmenu.ts                   # [MODIFICADO] Handler del navbar
└── pages/
    └── about/
        └── about.ts                      # [MODIFICADO] Ajuste para userId
```

---

### 1. Constante de ruta

**Archivo:** `src/core/features/user/constants.ts`

```typescript
// Se agregó esta línea:
export const CORE_USER_PROFILE_PAGE_NAME = 'profile';
```

**Propósito:** Define el segmento de URL. Cuando el usuario toca el tab, navega a `/main/profile`.

---

### 2. MainMenu Handler

**Archivo:** `src/core/features/user/services/handlers/mainmenu.ts`

```typescript
// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Injectable } from '@angular/core';
import { makeSingleton } from '@singletons';
import { CoreMainMenuHandler, CoreMainMenuHandlerData } from '@features/mainmenu/services/mainmenu-delegate';
import { CORE_USER_PROFILE_PAGE_NAME } from '@features/user/constants';

/**
 * Handler to inject user profile option into main menu.
 */
@Injectable({ providedIn: 'root' })
export class PageUserProfileMainMenuHandlerService implements CoreMainMenuHandler {

    name = 'PageUserProfile';
    priority = 800;

    /**
     * Check if the handler is enabled on a site level.
     *
     * @returns Whether or not the handler is enabled on a site level.
     */
    async isEnabled(): Promise<boolean> {
        return true;
    }

    /**
     * Returns the data needed to render the handler.
     *
     * @returns Data needed to render the handler.
     */
    getDisplayData(): CoreMainMenuHandlerData {
        return {
            icon: 'cedia-user',
            title: 'core.user.userprofile',
            page: CORE_USER_PROFILE_PAGE_NAME,
            class: 'page-userprofile-handler',
        };
    }

}

export const PageUserProfileMainMenuHandler = makeSingleton(PageUserProfileMainMenuHandlerService);
```

**Explicación de cada parte:**

| Propiedad/Método | Descripción |
|------------------|-------------|
| `implements CoreMainMenuHandler` | Interfaz obligatoria para que el delegate lo reconozca |
| `name` | Identificador único del handler |
| `priority` | Posición en el navbar (mayor = más a la izquierda) |
| `isEnabled()` | Retorna `true` si el tab debe mostrarse. Puede consultar permisos del sitio |
| `getDisplayData()` | Retorna el objeto con icon, título, página y clase CSS |
| `makeSingleton()` | Crea un singleton accesible con `.instance` |

---

### 3. Lazy Module

**Archivo:** `src/core/features/user/user-lazy.module.ts` (NUEVO)

```typescript
// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Injector, NgModule } from '@angular/core';
import { ROUTES, Routes } from '@angular/router';

import { buildTabMainRoutes } from '@features/mainmenu/mainmenu-tab-routing.module';
import { CORE_USER_PROFILE_PAGE_NAME } from './constants';

/**
 * Build module routes.
 *
 * @param injector Injector.
 * @returns Routes.
 */
function buildRoutes(injector: Injector): Routes {
    return [
        {
            path: 'index',
            data: { mainMenuTabRoot: CORE_USER_PROFILE_PAGE_NAME },
            loadComponent: () => import('@features/user/pages/about/about'),
        },
        ...buildTabMainRoutes(injector, {
            redirectTo: 'index',
            pathMatch: 'full',
        }),
    ];
}

@NgModule({
    providers: [
        {
            provide: ROUTES,
            multi: true,
            deps: [Injector],
            useFactory: buildRoutes,
        },
    ],
})
export default class CoreUserProfileLazyModule {}
```

**Explicación de cada parte:**

| Elemento | Descripción |
|----------|-------------|
| `export default class` | Requerido para `loadChildren: () => import(...)` |
| `provide: ROUTES` | Usa factory para inyectar el Injector |
| `path: 'index'` | URL final: `/main/profile/index` |
| `data: { mainMenuTabRoot }` | Marca esta ruta como raíz del tab (para navegación) |
| `loadComponent` | Lazy loading del componente de página |
| `buildTabMainRoutes()` | Agrega redirect y rutas compartidas entre tabs |

---

### 4. Feature Module (Registro)

**Archivo:** `src/core/features/user/user.module.ts`

**Imports agregados:**

```typescript
import { PARTICIPANTS_PAGE_NAME, CORE_USER_PROFILE_PAGE_NAME } from './constants';
import { CoreMainMenuRoutingModule } from '@features/mainmenu/mainmenu-routing.module';
import { CoreMainMenuDelegate } from '@features/mainmenu/services/mainmenu-delegate';
import { PageUserProfileMainMenuHandler } from './services/handlers/mainmenu';
```

**Rutas del mainmenu:**

```typescript
const mainMenuChildrenRoutes: Routes = [
    {
        path: CORE_USER_PROFILE_PAGE_NAME,  // 'profile'
        loadChildren: () => import('./user-lazy.module'),
    },
];
```

**Registro en @NgModule:**

```typescript
@NgModule({
    imports: [
        AppRoutingModule.forChild(appRoutes),
        CoreMainMenuTabRoutingModule.forChild(routes),
        // --- LÍNEAS AGREGADAS ---
        CoreMainMenuTabRoutingModule.forChild(mainMenuChildrenRoutes),
        CoreMainMenuRoutingModule.forChild({ children: mainMenuChildrenRoutes }),
        // ------------------------
        CoreCourseIndexRoutingModule.forChild({ children: courseIndexRoutes }),
    ],
    providers: [
        // ...existing providers...
        provideAppInitializer(() => {
            // ...existing registrations...

            // --- LÍNEA AGREGADA ---
            CoreMainMenuDelegate.registerHandler(PageUserProfileMainMenuHandler.instance);
            // ----------------------
        }),
    ],
})
export class CoreUserModule {}
```

**Explicación de los imports del módulo:**

| Import | Propósito |
|--------|-----------|
| `CoreMainMenuTabRoutingModule.forChild(mainMenuChildrenRoutes)` | Permite navegar a `/profile` desde cualquier tab |
| `CoreMainMenuRoutingModule.forChild({ children: ... })` | Registra `/profile` como tab del mainmenu |
| `CoreMainMenuDelegate.registerHandler(...)` | Hace que el handler sea conocido por el navbar |

---

## Ejemplo Práctico: Crear Tab "Game"

Ahora crearemos un nuevo tab llamado **Game** desde cero.

### Estructura de archivos a crear

```
src/addons/game/                          # Nueva carpeta del addon
├── constants.ts                          # Constantes
├── game.module.ts                        # Feature module
├── game-lazy.module.ts                   # Lazy module
├── lang.json                             # Traducciones
├── services/
│   └── handlers/
│       └── mainmenu.ts                   # Handler del navbar
└── pages/
    └── index/
        ├── index.ts                      # Componente de página
        ├── index.html                    # Template
        └── index.scss                    # Estilos (opcional)
```

---

### Paso 1: Crear constantes

**Archivo:** `src/addons/game/constants.ts`

```typescript
// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Page name for the game tab in main menu.
 */
export const ADDON_GAME_PAGE_NAME = 'game';
```

---

### Paso 2: Crear archivo de traducciones

**Archivo:** `src/addons/game/lang.json`

```json
{
    "game": "Game",
    "gametab": "Game",
    "welcome": "Welcome to the Game section!",
    "description": "Here you can play educational games.",
    "nogames": "No games available at this time.",
    "play": "Play",
    "score": "Score",
    "highscore": "High Score"
}
```

---

### Paso 3: Crear el MainMenu Handler

**Archivo:** `src/addons/game/services/handlers/mainmenu.ts`

```typescript
// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Injectable } from '@angular/core';
import { makeSingleton } from '@singletons';
import { CoreMainMenuHandler, CoreMainMenuHandlerData } from '@features/mainmenu/services/mainmenu-delegate';
import { ADDON_GAME_PAGE_NAME } from '@addons/game/constants';

/**
 * Handler to inject game option into main menu.
 */
@Injectable({ providedIn: 'root' })
export class AddonGameMainMenuHandlerService implements CoreMainMenuHandler {

    name = 'AddonGame';
    priority = 600;  // Después de Messages (700) y antes de Calendar (550)

    /**
     * Check if the handler is enabled on a site level.
     *
     * @returns Whether or not the handler is enabled on a site level.
     */
    async isEnabled(): Promise<boolean> {
        // Siempre habilitado. Puedes agregar lógica condicional aquí:
        // return AddonGame.isGameEnabledInSite();
        return true;
    }

    /**
     * Returns the data needed to render the handler.
     *
     * @returns Data needed to render the handler.
     */
    getDisplayData(): CoreMainMenuHandlerData {
        return {
            icon: 'fas-gamepad',           // Icono de FontAwesome o personalizado
            title: 'addon.game.gametab',   // Clave de traducción
            page: ADDON_GAME_PAGE_NAME,    // Ruta: /main/game
            class: 'addon-game-handler',   // Clase CSS para estilos
        };
    }

}

export const AddonGameMainMenuHandler = makeSingleton(AddonGameMainMenuHandlerService);
```

---

### Paso 4: Crear la página principal

**Archivo:** `src/addons/game/pages/index/index.html`

```html
<ion-header>
    <ion-toolbar>
        <ion-buttons slot="start">
            <ion-back-button [text]="'core.back' | translate"></ion-back-button>
        </ion-buttons>
        <ion-title>
            <h1>{{ 'addon.game.game' | translate }}</h1>
        </ion-title>
        <ion-buttons slot="end">
            <!-- Botones adicionales si necesitas -->
        </ion-buttons>
    </ion-toolbar>
</ion-header>

<ion-content>
    <ion-refresher slot="fixed" [disabled]="!dataLoaded" (ionRefresh)="refreshData($event.target)">
        <ion-refresher-content pullingText="{{ 'core.pulltorefresh' | translate }}"></ion-refresher-content>
    </ion-refresher>

    <core-loading [hideUntil]="dataLoaded">

        <!-- Contenido principal -->
        <ion-card>
            <ion-card-header>
                <ion-card-title>{{ 'addon.game.welcome' | translate }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
                <p>{{ 'addon.game.description' | translate }}</p>
            </ion-card-content>
        </ion-card>

        <!-- Lista de juegos (ejemplo) -->
        <ion-list *ngIf="games.length > 0">
            <ion-item *ngFor="let game of games" button (click)="openGame(game)">
                <ion-icon [name]="game.icon" slot="start"></ion-icon>
                <ion-label>
                    <h2>{{ game.name }}</h2>
                    <p>{{ game.description }}</p>
                </ion-label>
                <ion-badge slot="end" color="primary">
                    {{ 'addon.game.score' | translate }}: {{ game.score }}
                </ion-badge>
            </ion-item>
        </ion-list>

        <!-- Estado vacío -->
        <core-empty-box *ngIf="games.length === 0"
            icon="fas-gamepad"
            [message]="'addon.game.nogames' | translate">
        </core-empty-box>

    </core-loading>
</ion-content>
```

**Archivo:** `src/addons/game/pages/index/index.ts`

```typescript
// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Component, OnInit } from '@angular/core';
import { CoreSharedModule } from '@/core/shared.module';
import { CoreAlerts } from '@services/overlays/alerts';

/**
 * Interface for game data.
 */
interface GameItem {
    id: number;
    name: string;
    description: string;
    icon: string;
    score: number;
}

/**
 * Page that displays the game section.
 */
@Component({
    selector: 'page-addon-game-index',
    templateUrl: 'index.html',
    styleUrls: ['index.scss'],
    imports: [
        CoreSharedModule,
    ],
})
export default class AddonGameIndexPage implements OnInit {

    dataLoaded = false;
    games: GameItem[] = [];

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        await this.fetchData();
    }

    /**
     * Fetch games data.
     *
     * @returns Promise resolved when done.
     */
    async fetchData(): Promise<void> {
        try {
            // Aquí cargarías los datos reales desde un servicio
            // this.games = await AddonGame.getGames();

            // Datos de ejemplo:
            this.games = [
                {
                    id: 1,
                    name: 'Quiz Master',
                    description: 'Test your knowledge!',
                    icon: 'fas-question-circle',
                    score: 850,
                },
                {
                    id: 2,
                    name: 'Word Puzzle',
                    description: 'Find the hidden words',
                    icon: 'fas-puzzle-piece',
                    score: 620,
                },
                {
                    id: 3,
                    name: 'Math Challenge',
                    description: 'Solve math problems',
                    icon: 'fas-calculator',
                    score: 1200,
                },
            ];
        } catch (error) {
            CoreAlerts.showError(error);
        } finally {
            this.dataLoaded = true;
        }
    }

    /**
     * Refresh data.
     *
     * @param refresher Refresher element.
     */
    async refreshData(refresher?: HTMLIonRefresherElement): Promise<void> {
        await this.fetchData();
        refresher?.complete();
    }

    /**
     * Open a game.
     *
     * @param game Game to open.
     */
    openGame(game: GameItem): void {
        // Navegar a la página del juego específico
        // CoreNavigator.navigateToSitePath(`/game/play/${game.id}`);
        CoreAlerts.showAlert({
            header: game.name,
            message: `Playing ${game.name}...`,
            buttons: ['OK'],
        });
    }

}
```

**Archivo:** `src/addons/game/pages/index/index.scss`

```scss
// Estilos específicos para la página de Game (opcional)

page-addon-game-index {
    ion-card {
        margin: 16px;
    }

    ion-badge {
        min-width: 60px;
        text-align: center;
    }
}
```

---

### Paso 5: Crear el Lazy Module

**Archivo:** `src/addons/game/game-lazy.module.ts`

```typescript
// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Injector, NgModule } from '@angular/core';
import { ROUTES, Routes } from '@angular/router';

import { buildTabMainRoutes } from '@features/mainmenu/mainmenu-tab-routing.module';
import { ADDON_GAME_PAGE_NAME } from './constants';

/**
 * Build module routes.
 *
 * @param injector Injector.
 * @returns Routes.
 */
function buildRoutes(injector: Injector): Routes {
    return [
        {
            path: 'index',
            data: { mainMenuTabRoot: ADDON_GAME_PAGE_NAME },
            loadComponent: () => import('@addons/game/pages/index/index'),
        },
        // Puedes agregar más rutas aquí:
        // {
        //     path: 'play/:gameId',
        //     loadComponent: () => import('@addons/game/pages/play/play'),
        // },
        // {
        //     path: 'leaderboard',
        //     loadComponent: () => import('@addons/game/pages/leaderboard/leaderboard'),
        // },
        ...buildTabMainRoutes(injector, {
            redirectTo: 'index',
            pathMatch: 'full',
        }),
    ];
}

@NgModule({
    providers: [
        {
            provide: ROUTES,
            multi: true,
            deps: [Injector],
            useFactory: buildRoutes,
        },
    ],
})
export default class AddonGameLazyModule {}
```

---

### Paso 6: Crear el Feature Module

**Archivo:** `src/addons/game/game.module.ts`

```typescript
// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { NgModule, provideAppInitializer } from '@angular/core';
import { Routes } from '@angular/router';
import { CoreMainMenuRoutingModule } from '@features/mainmenu/mainmenu-routing.module';
import { CoreMainMenuTabRoutingModule } from '@features/mainmenu/mainmenu-tab-routing.module';
import { CoreMainMenuDelegate } from '@features/mainmenu/services/mainmenu-delegate';
import { AddonGameMainMenuHandler } from './services/handlers/mainmenu';
import { ADDON_GAME_PAGE_NAME } from './constants';

/**
 * Routes for the game tab in main menu.
 */
const mainMenuChildrenRoutes: Routes = [
    {
        path: ADDON_GAME_PAGE_NAME,
        loadChildren: () => import('./game-lazy.module'),
    },
];

@NgModule({
    imports: [
        CoreMainMenuTabRoutingModule.forChild(mainMenuChildrenRoutes),
        CoreMainMenuRoutingModule.forChild({ children: mainMenuChildrenRoutes }),
    ],
    providers: [
        provideAppInitializer(() => {
            CoreMainMenuDelegate.registerHandler(AddonGameMainMenuHandler.instance);
        }),
    ],
})
export class AddonGameModule {}
```

---

### Paso 7: Registrar el módulo en la app

**Archivo:** `src/app/app.module.ts`

Busca el array de imports donde están los otros addons y agrega:

```typescript
import { AddonGameModule } from '@addons/game/game.module';

@NgModule({
    imports: [
        // ... otros módulos ...
        AddonGameModule,
    ],
})
export class AppModule {}
```

**Alternativa:** Si los addons se cargan dinámicamente, busca el archivo donde se registran (puede ser `src/addons/addons.module.ts` o similar) y agrega la importación ahí.

---

### Paso 8: Agregar el path alias (si es necesario)

**Archivo:** `tsconfig.json`

Verifica que exista el path alias para `@addons/*`:

```json
{
    "compilerOptions": {
        "paths": {
            "@addons/*": ["src/addons/*"],
            // ... otros paths ...
        }
    }
}
```

---

### Paso 9: Verificar la compilación

```bash
npm run build
```

Si hay errores, revisa:
1. Que todos los imports estén correctos
2. Que los archivos existan en las rutas especificadas
3. Que el módulo esté importado en `app.module.ts`

---

## Referencia de Prioridades

Los tabs se ordenan de mayor a menor prioridad (izquierda a derecha):

| Tab | Priority | Handler |
|-----|----------|---------|
| Home | 1000 | `CoreHomeMainMenuHandler` |
| **User Profile** | **800** | `PageUserProfileMainMenuHandler` |
| Messages | 700 | `AddonMessagesMainMenuHandler` |
| **Game (nuevo)** | **600** | `AddonGameMainMenuHandler` |
| Calendar | 550 | `AddonCalendarMainMenuHandler` |
| Notifications | 500 | `AddonNotificationsMainMenuHandler` |

**Nota:** Si hay demasiados tabs, los de menor prioridad se mueven al menú "More".

---

## Troubleshooting

### El tab no aparece en el navbar

1. **Verificar que el handler esté registrado:**
   ```typescript
   CoreMainMenuDelegate.registerHandler(TuHandler.instance);
   ```

2. **Verificar que `isEnabled()` retorne `true`:**
   ```typescript
   async isEnabled(): Promise<boolean> {
       return true;  // O tu lógica de habilitación
   }
   ```

3. **Verificar que el módulo esté importado en app.module.ts**

### Error: "Cannot find module"

- Verificar los path aliases en `tsconfig.json`
- Verificar que los archivos existan y las rutas sean correctas

### El tab aparece pero la página está en blanco

1. **Verificar el lazy module:**
   - Debe tener `export default class`
   - La ruta `index` debe existir

2. **Verificar el componente:**
   - Debe tener `export default class`
   - El template HTML debe existir

### Error de navegación

- Verificar que `mainMenuTabRoot` en la data de la ruta coincida con el `page` del handler:
  ```typescript
  // En lazy module:
  data: { mainMenuTabRoot: ADDON_GAME_PAGE_NAME }

  // En handler:
  page: ADDON_GAME_PAGE_NAME
  ```

---

## Resumen: Checklist para crear un nuevo tab

- [ ] Crear carpeta `src/addons/{nombre}/`
- [ ] Crear `constants.ts` con la constante de ruta
- [ ] Crear `lang.json` con traducciones
- [ ] Crear `services/handlers/mainmenu.ts` (handler)
- [ ] Crear `pages/index/index.ts` y `index.html` (página)
- [ ] Crear `{nombre}-lazy.module.ts` (lazy module)
- [ ] Crear `{nombre}.module.ts` (feature module)
- [ ] Importar el module en `app.module.ts`
- [ ] Ejecutar `npm run build` para verificar

---

## Referencias

- **Ejemplo de Calendar:** `src/addons/calendar/`
- **Ejemplo de Messages:** `src/addons/messages/`
- **MainMenu Delegate:** `src/core/features/mainmenu/services/mainmenu-delegate.ts`
- **Tab Routing Module:** `src/core/features/mainmenu/mainmenu-tab-routing.module.ts`