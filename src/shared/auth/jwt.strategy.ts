import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  ExtractJwt,
  SecretOrKeyProvider,
  Strategy,
  StrategyOptions,
} from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { AppConfig } from '../config/configuration';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';

// `JwtStrategy` is an unconditional Nest provider constructed in every
// `JWT_MODE`, and `passport-jwt` throws without a key source. Mock mode is
// unreachable at request time (`JwtAuthGuard` short-circuits it before
// `super.canActivate()` ever runs — jwt-auth.guard.ts:33-38), but the
// provider must still be constructible with zero secret material. If a
// token were ever routed here regardless, fail closed rather than accept it.
const rejectAlways: SecretOrKeyProvider = (_req, _rawJwtToken, done) =>
  done(new Error('JWT_MODE=mock does not verify tokens'));

function buildStrategyOptions(jwt: AppConfig['jwt']): StrategyOptions {
  const base = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    algorithms: ['RS256'] as StrategyOptions['algorithms'],
    issuer: jwt.issuer,
    audience: jwt.audience,
  };

  switch (jwt.mode) {
    case 'jwks':
      if (!jwt.jwksUrl) throw new Error('JWT_MODE=jwks requires JWT_JWKS_URL');
      return {
        ...base,
        secretOrKeyProvider: passportJwtSecret({
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 10,
          jwksUri: jwt.jwksUrl,
        }),
      };
    case 'static':
      if (!jwt.publicKey)
        throw new Error('JWT_MODE=static requires JWT_PUBLIC_KEY');
      return { ...base, secretOrKey: jwt.publicKey };
    case 'mock':
      return { ...base, secretOrKeyProvider: rejectAlways };
    default: {
      const exhaustive: never = jwt.mode;
      throw new Error(`Unsupported JWT_MODE: ${String(exhaustive)}`);
    }
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<AppConfig, true>) {
    const opts = buildStrategyOptions(config.get('jwt', { infer: true }));

    // super() está tipado como overload de tuplas; nuestro opts nunca setea
    // passReqToCallback, así que es siempre la variante sin request. ESLint's
    // type-aware checker (via the dynamic `PassportStrategy()` mixin) reports
    // this cast as redundant, but ts-jest's real compilation fails without
    // it — keep it.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    super(opts as Extract<StrategyOptions, { passReqToCallback?: false }>);
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload.sub) throw new UnauthorizedException('Missing sub claim');
    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
      salesRepId: payload.sales_rep_id,
      employeeId: payload.employee_id,
      profileComplete: payload.profile_complete,
    };
  }
}
