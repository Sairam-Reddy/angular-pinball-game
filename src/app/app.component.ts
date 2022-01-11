import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
} from '@angular/core';
import * as Matter from 'matter-js';
import { Vertices } from 'matter-js';
import decomp = require('poly-decomp');
import MatterAttractors = require('matter-attractors');

@Component({
  selector: 'my-app',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements AfterViewInit {
  @ViewChild('elem') elem: ElementRef;

  // constants
  public PATHS = {
    DOME: '0 0 0 250 19 250 20 231.9 25.7 196.1 36.9 161.7 53.3 129.5 74.6 100.2 100.2 74.6 129.5 53.3 161.7 36.9 196.1 25.7 231.9 20 268.1 20 303.9 25.7 338.3 36.9 370.5 53.3 399.8 74.6 425.4 100.2 446.7 129.5 463.1 161.7 474.3 196.1 480 231.9 480 250 500 250 500 0 0 0',
    DROP_LEFT: '0 0 20 0 70 100 20 150 0 150 0 0',
    DROP_RIGHT: '50 0 68 0 68 150 50 150 0 100 50 0',
    APRON_LEFT: '0 0 180 120 0 120 0 0',
    APRON_RIGHT: '180 0 180 120 0 120 180 0',
  };
  public COLOR = {
    BACKGROUND: '#212529',
    OUTER: '#495057',
    INNER: '#15aabf',
    BUMPER: '#fab005',
    BUMPER_LIT: '#fff3bf',
    PADDLE: '#e64980',
    PINBALL: '#dee2e6',
  };
  public GRAVITY = 0.75;
  public WIREFRAMES = false;
  public BUMPER_BOUNCE = 1.5;
  public PADDLE_PULL = 0.002;
  public MAX_VELOCITY = 50;

  // shared variables
  public currentScore = 0;
  public highScore = 0;
  private engine: Matter.Engine;
  private world: Matter.World;
  private render;
  private pinball;
  private stopperGroup;
  private leftPaddle;
  private leftUpStopper;
  private leftDownStopper;
  private isLeftPaddleUp;
  private rightPaddle;
  private rightUpStopper;
  private rightDownStopper;
  private isRightPaddleUp;

  @HostListener('window.keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    console.log(event);
  }

  @HostListener('window.keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent) {
    console.log(event);
  }

  public ngAfterViewInit(): void {
    Matter.Common.setDecomp(decomp);
    Matter.use(MatterAttractors);

    this.load();
  }

  private load() {
    this.init();
    this.createStaticBodies();
    this.createPaddles();
    this.createPinball();
    this.createEvents();
  }

  private init() {
    // engine (shared)
    this.engine = Matter.Engine.create();

    // world (shared)
    this.world = this.engine.world;
    this.world.bounds = {
      min: { x: 0, y: 0 },
      max: { x: 500, y: 800 },
    };
    this.world.gravity.y = this.GRAVITY; // simulate rolling on a slanted table

    // render (shared)
    this.render = Matter.Render.create({
      element: this.elem.nativeElement,
      engine: this.engine,
      options: {
        width: this.world.bounds.max.x,
        height: this.world.bounds.max.y,
        wireframes: this.WIREFRAMES,
        background: this.COLOR.BACKGROUND,
      },
    });
    Matter.Render.run(this.render);

    // runner
    let runner = Matter.Runner.create();
    Matter.Runner.run(runner, this.engine);

    // used for collision filtering on various bodies
    this.stopperGroup = Matter.Body.nextGroup(true);

    // starting values
    this.currentScore = 0;
    this.highScore = 0;
    this.isLeftPaddleUp = false;
    this.isRightPaddleUp = false;
  }

  private createStaticBodies() {
    Matter.World.add(this.world, [
      // table boundaries (top, bottom, left, right)
      this.boundary(250, -30, 500, 100),
      this.boundary(250, 830, 500, 100),
      this.boundary(-30, 400, 100, 800),
      this.boundary(530, 400, 100, 800),

      // dome
      this.path(239, 86, this.PATHS.DOME),

      // pegs (left, mid, right)
      this.wall(140, 140, 20, 40, this.COLOR.INNER),
      this.wall(225, 140, 20, 40, this.COLOR.INNER),
      this.wall(310, 140, 20, 40, this.COLOR.INNER),

      // top bumpers (left, mid, right)
      this.bumper(105, 250),
      this.bumper(225, 250),
      this.bumper(345, 250),

      // bottom bumpers (left, right)
      this.bumper(165, 340),
      this.bumper(285, 340),

      // shooter lane wall
      this.wall(440, 520, 20, 560, this.COLOR.OUTER),

      // drops (left, right)
      this.path(25, 360, this.PATHS.DROP_LEFT),
      this.path(425, 360, this.PATHS.DROP_RIGHT),

      // slingshots (left, right)
      this.wall(120, 510, 20, 120, this.COLOR.INNER),
      this.wall(330, 510, 20, 120, this.COLOR.INNER),

      // out lane walls (left, right)
      this.wall(60, 529, 20, 160, this.COLOR.INNER),
      this.wall(390, 529, 20, 160, this.COLOR.INNER),

      // flipper walls (left, right);
      this.wall(93, 624, 20, 98, this.COLOR.INNER, -0.96),
      this.wall(357, 624, 20, 98, this.COLOR.INNER, 0.96),

      // aprons (left, right)
      this.path(79, 740, this.PATHS.APRON_LEFT),
      this.path(371, 740, this.PATHS.APRON_RIGHT),

      // reset zones (center, right)
      this.reset(225, 50),
      this.reset(465, 30),
    ]);
  }

  private createPaddles() {
    // these bodies keep paddle swings contained, but allow the ball to pass through
    this.leftUpStopper = this.stopper(160, 591, 'left', 'up');
    this.leftDownStopper = this.stopper(140, 743, 'left', 'down');
    this.rightUpStopper = this.stopper(290, 591, 'right', 'up');
    this.rightDownStopper = this.stopper(310, 743, 'right', 'down');
    Matter.World.add(this.world, [
      this.leftUpStopper,
      this.leftDownStopper,
      this.rightUpStopper,
      this.rightDownStopper,
    ]);

    // this group lets paddle pieces overlap each other
    let paddleGroup = Matter.Body.nextGroup(true);

    // Left paddle mechanism
    let paddleLeft = {
      paddle: undefined,
      brick: undefined,
      comp: undefined,
      hinge: undefined,
      con: undefined,
    };
    paddleLeft.paddle = Matter.Bodies.trapezoid(170, 660, 20, 80, 0.33, {
      label: 'paddleLeft',
      angle: 1.57,
      chamfer: {},
      render: {
        fillStyle: this.COLOR.PADDLE,
      },
    });
    paddleLeft.brick = Matter.Bodies.rectangle(172, 672, 40, 80, {
      angle: 1.62,
      chamfer: {},
      render: {
        visible: false,
      },
    });
    paddleLeft.comp = Matter.Body.create({
      label: 'paddleLeftComp',
      parts: [paddleLeft.paddle, paddleLeft.brick],
    });
    paddleLeft.hinge = Matter.Bodies.circle(142, 660, 5, {
      isStatic: true,
      render: {
        visible: false,
      },
    });
    Object.keys(paddleLeft).forEach((piece: any) => {
      if (piece && paddleLeft[piece]) {
        paddleLeft[piece].collisionFilter.group = paddleGroup;
      }
    });
    paddleLeft.con = Matter.Constraint.create({
      bodyA: paddleLeft.comp,
      pointA: { x: -29.5, y: -8.5 },
      bodyB: paddleLeft.hinge,
      length: 0,
      stiffness: 0,
    });
    Matter.World.add(this.world, [
      paddleLeft.comp,
      paddleLeft.hinge,
      paddleLeft.con,
    ]);
    Matter.Body.setPosition(paddleLeft.comp, Matter.Vector.create(142, 660));
    Matter.Body.rotate(paddleLeft.comp, 0.57);

    // right paddle mechanism
    let paddleRight = {
      paddle: undefined,
      brick: undefined,
      comp: undefined,
      hinge: undefined,
      con: undefined,
    };
    paddleRight.paddle = Matter.Bodies.trapezoid(280, 660, 20, 80, 0.33, {
      label: 'paddleRight',
      angle: -1.57,
      chamfer: {},
      render: {
        fillStyle: this.COLOR.PADDLE,
      },
    });
    paddleRight.brick = Matter.Bodies.rectangle(278, 672, 40, 80, {
      angle: -1.62,
      chamfer: {},
      render: {
        visible: false,
      },
    });
    paddleRight.comp = Matter.Body.create({
      label: 'paddleRightComp',
      parts: [paddleRight.paddle, paddleRight.brick],
    });
    paddleRight.hinge = Matter.Bodies.circle(308, 660, 5, {
      isStatic: true,
      render: {
        visible: false,
      },
    });
    Object.keys(paddleRight).forEach((piece: any) => {
      if (piece && paddleRight[piece]) {
        paddleRight[piece].collisionFilter.group = paddleGroup;
      }
    });
    paddleRight.con = Matter.Constraint.create({
      bodyA: paddleRight.comp,
      pointA: { x: 29.5, y: -8.5 },
      bodyB: paddleRight.hinge,
      length: 0,
      stiffness: 0,
    });
    Matter.World.add(this.world, [
      paddleRight.comp,
      paddleRight.hinge,
      paddleRight.con,
    ]);
    Matter.Body.setPosition(paddleRight.comp, Matter.Vector.create(308, 660));
    Matter.Body.rotate(paddleRight.comp, -0.57);
  }

  private createPinball() {
    // x/y are set to when pinball is launched
    this.pinball = Matter.Bodies.circle(0, 0, 14, {
      label: 'pinball',
      collisionFilter: {
        group: this.stopperGroup,
      },
      render: {
        fillStyle: this.COLOR.PINBALL,
      },
    });
    Matter.World.add(this.world, this.pinball);
    this.launchPinball();
  }

  private createEvents() {
    // events for when the pinball hits stuff
    Matter.Events.on(
      this.engine,
      'collisionStart',
      this.handleCollisionStart.bind(this)
    );

    // regulate pinball
    Matter.Events.on(
      this.engine,
      'beforeUpdate',
      this.handlebeforeUpdate.bind(this)
    );

    // mouse drag (god mode for grabbing pinball)
    Matter.World.add(
      this.world,
      Matter.MouseConstraint.create(this.engine, {
        mouse: Matter.Mouse.create(this.render.canvas),
        constraint: {
          stiffness: 0.2,
          render: {
            visible: false,
          },
        } as Matter.Constraint,
      })
    );
  }

  public setLeftPaddleUp(event): void {
    this.isLeftPaddleUp = true;
  }

  public setLeftPaddleDown(event): void {
    this.isLeftPaddleUp = false;
  }

  public setRightPaddleUp(event): void {
    this.isRightPaddleUp = true;
  }

  public setRightPaddleDown(event): void {
    this.isRightPaddleUp = false;
  }

  private handleCollisionStart(event): void {
    let pairs = event.pairs;
    pairs.forEach((pair) => {
      if (pair.bodyB.label === 'pinball') {
        switch (pair.bodyA.label) {
          case 'reset':
            this.launchPinball();
            break;
          case 'bumper':
            this.pingBumper(pair.bodyA);
            break;
        }
      }
    });
  }

  private handlebeforeUpdate(event): void {
    // bumpers can quickly multiply velocity, so keep that in check
    Matter.Body.setVelocity(this.pinball, {
      x: Math.max(
        Math.min(this.pinball.velocity.x, this.MAX_VELOCITY),
        -this.MAX_VELOCITY
      ),
      y: Math.max(
        Math.min(this.pinball.velocity.y, this.MAX_VELOCITY),
        -this.MAX_VELOCITY
      ),
    });

    // cheap way to keep ball from going back down the shooter lane
    if (this.pinball.position.x > 450 && this.pinball.velocity.y > 0) {
      Matter.Body.setVelocity(this.pinball, { x: 0, y: -10 });
    }
  }

  private launchPinball() {
    this.updateScore(0);
    Matter.Body.setPosition(this.pinball, { x: 465, y: 765 });
    Matter.Body.setVelocity(this.pinball, { x: 0, y: -25 + this.rand(-2, 2) });
    Matter.Body.setAngularVelocity(this.pinball, 0);
  }

  private pingBumper(bumper) {
    this.updateScore(this.currentScore + 10);

    // flash color
    bumper.render.fillStyle = this.COLOR.BUMPER_LIT;
    setTimeout(() => {
      bumper.render.fillStyle = this.COLOR.BUMPER;
    }, 100);
  }

  private updateScore(newCurrentScore) {
    this.currentScore = newCurrentScore;

    this.highScore = Math.max(this.currentScore, this.highScore);
  }

  // matter.js has a built in random range function, but it is deterministic
  private rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  // outer edges of pinball table
  private boundary(x, y, width, height) {
    return Matter.Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      render: {
        fillStyle: this.COLOR.OUTER,
      },
    });
  }

  // wall segments
  private wall(x, y, width, height, color, angle = 0) {
    return Matter.Bodies.rectangle(x, y, width, height, {
      angle: angle,
      isStatic: true,
      chamfer: { radius: 10 },
      render: {
        fillStyle: color,
      },
    });
  }

  // bodies created from SVG paths
  private path(x, y, path) {
    const vertices = Vertices.fromPath(path, undefined);
    return Matter.Bodies.fromVertices(x, y, [vertices], {
      isStatic: true,
      render: {
        fillStyle: this.COLOR.OUTER,

        // add stroke and line width to fill in slight gaps between fragments
        strokeStyle: this.COLOR.OUTER,
        lineWidth: 1,
      },
    });
  }

  // round bodies that repel pinball
  private bumper(x, y) {
    let bumper = Matter.Bodies.circle(x, y, 25, {
      label: 'bumper',
      isStatic: true,
      render: {
        fillStyle: this.COLOR.BUMPER,
      },
    });

    // for some reason, restitution is reset unless it's set after body creation
    bumper.restitution = this.BUMPER_BOUNCE;

    return bumper;
  }

  // invisible bodies to constrict paddles
  private stopper(x, y, side, position) {
    // determine which paddle composite to interact with
    let attracteeLabel = side === 'left' ? 'paddleLeftComp' : 'paddleRightComp';

    return Matter.Bodies.circle(x, y, 40, {
      isStatic: true,
      render: {
        visible: false,
      },
      collisionFilter: {
        group: this.stopperGroup,
      },
      plugin: {
        attractors: [
          // stopper is always a, other body is b
          (a, b) => {
            if (b.label === attracteeLabel) {
              let isPaddleUp =
                side === 'left' ? this.isLeftPaddleUp : this.isRightPaddleUp;
              let isPullingUp = position === 'up' && isPaddleUp;
              let isPullingDown = position === 'down' && !isPaddleUp;
              if (isPullingUp || isPullingDown) {
                return {
                  x: (a.position.x - b.position.x) * this.PADDLE_PULL,
                  y: (a.position.y - b.position.y) * this.PADDLE_PULL,
                };
              }
            }
          },
        ],
      },
    });
  }

  // contact with these bodies causes pinball to be relaunched
  private reset(x, width) {
    return Matter.Bodies.rectangle(x, 781, width, 2, {
      label: 'reset',
      isStatic: true,
      render: {
        fillStyle: '#fff',
      },
    });
  }
}
