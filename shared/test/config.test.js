const { loadConfig } = require('../src/config');

describe('shared/src/config', () => {
  let exitSpy;
  let errorSpy;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit: ${code}`);
    });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('with all required vars set, the loader returns them and the object is frozen', () => {
    const env = {
      NODE_ENV: 'test',
      API_PORT: '3000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/simera_test'
    };

    const config = loadConfig({ env, skipDotenv: true });

    expect(config.NODE_ENV).toBe('test');
    expect(config.API_PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe(
      'postgresql://postgres:postgres@localhost:5432/simera_test'
    );
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('with DATABASE_URL missing, the loader exits with code 1 and the message contains "DATABASE_URL"', () => {
    const env = {
      NODE_ENV: 'test',
      API_PORT: '3000'
    };

    expect(() => {
      loadConfig({ env, skipDotenv: true });
    }).toThrow('process.exit: 1');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();
    const message = errorSpy.mock.calls[0][0];
    expect(message).toContain('DATABASE_URL');
  });

  it('with two vars missing, the message names both', () => {
    const env = {
      NODE_ENV: 'test'
    };

    expect(() => {
      loadConfig({ env, skipDotenv: true });
    }).toThrow('process.exit: 1');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();
    const message = errorSpy.mock.calls[0][0];
    expect(message).toContain('API_PORT');
    expect(message).toContain('DATABASE_URL');
  });

  it('the message never contains the value of any variable', () => {
    const secretValue = 'secret-value-123';
    const env = {
      NODE_ENV: secretValue
    };

    expect(() => {
      loadConfig({ env, skipDotenv: true });
    }).toThrow('process.exit: 1');

    expect(errorSpy).toHaveBeenCalled();
    const message = errorSpy.mock.calls[0][0];
    expect(message).not.toContain(secretValue);
  });
  it('uses the default confidence threshold when not provided', () => {
  const env = {
    NODE_ENV: 'test',
    API_PORT: '3000',
    DATABASE_URL: 'postgresql://localhost/test'
  };

  const config = loadConfig({ env, skipDotenv: true });

  expect(config.CONFIDENCE_THRESHOLD).toBe(0.5);
});

it('loads a valid confidence threshold', () => {
  const env = {
    NODE_ENV: 'test',
    API_PORT: '3000',
    DATABASE_URL: 'postgresql://localhost/test',
    CONFIDENCE_THRESHOLD: '0.7'
  };

  const config = loadConfig({ env, skipDotenv: true });

  expect(config.CONFIDENCE_THRESHOLD).toBe(0.7);
});

it.each(['-0.1', '1.1', 'abc', ''])(
  'rejects invalid confidence threshold: %s',
  (value) => {
    const env = {
      NODE_ENV: 'test',
      API_PORT: '3000',
      DATABASE_URL: 'postgresql://localhost/test',
      CONFIDENCE_THRESHOLD: value
    };

    expect(() => loadConfig({ env, skipDotenv: true })).toThrow(
      'process.exit: 1'
    );
  }
);
});
