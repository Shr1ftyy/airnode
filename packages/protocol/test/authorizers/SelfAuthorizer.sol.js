/* globals ethers */

const { expect } = require('chai');

const AdminStatus = {
  Unauthorized: 0,
  Admin: 1,
  SuperAdmin: 2,
};

let roles;
let selfAuthorizer, airnodeRrp;
let airnodeId;
const requesterIndex = 123;
const requestId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
const endpointId = ethers.utils.hexlify(ethers.utils.randomBytes(32));

beforeEach(async () => {
  const accounts = await ethers.getSigners();
  roles = {
    deployer: accounts[0],
    airnodeMasterWallet: accounts[1],
    airnodeAdmin: accounts[2],
    superAdmin: accounts[3],
    admin: accounts[4],
    client: accounts[5],
    randomPerson: accounts[9],
  };
  const airnodeRrpFactory = await ethers.getContractFactory('AirnodeRrp', roles.deployer);
  airnodeRrp = await airnodeRrpFactory.deploy();
  const selfAuthorizerFactory = await ethers.getContractFactory('SelfAuthorizer', roles.deployer);
  selfAuthorizer = await selfAuthorizerFactory.deploy(airnodeRrp.address);
  airnodeId = await airnodeRrp
    .connect(roles.airnodeMasterWallet)
    .callStatic.setAirnodeParameters(roles.airnodeAdmin.address, 'xpub...', [selfAuthorizer.address]);
  await airnodeRrp
    .connect(roles.airnodeMasterWallet)
    .setAirnodeParameters(roles.airnodeAdmin.address, 'xpub...', [selfAuthorizer.address]);
});

describe('constructor', function () {
  describe('Airnode RRP address is non-zero', function () {
    it('initializes correctly', async function () {
      expect(await selfAuthorizer.authorizerType()).to.equal(2);
      expect(await selfAuthorizer.airnodeRrp()).to.equal(airnodeRrp.address);
    });
  });
  describe('Airnode RRP address is zero', function () {
    it('reverts', async function () {
      const selfAuthorizerFactory = await ethers.getContractFactory('SelfAuthorizer', roles.deployer);
      await expect(selfAuthorizerFactory.deploy(ethers.constants.AddressZero)).to.be.revertedWith('Zero address');
    });
  });
});

describe('setAdminStatus', function () {
  describe('Caller is the Airnode admin', async function () {
    it('sets admin status', async function () {
      // Give admin status
      await expect(
        selfAuthorizer.connect(roles.airnodeAdmin).setAdminStatus(airnodeId, roles.admin.address, AdminStatus.Admin)
      )
        .to.emit(selfAuthorizer, 'SetAdminStatus')
        .withArgs(airnodeId, roles.admin.address, AdminStatus.Admin);
      expect(await selfAuthorizer.airnodeIdToAdminStatuses(airnodeId, roles.admin.address)).to.equal(AdminStatus.Admin);
      // Revoke admin status
      await expect(
        selfAuthorizer
          .connect(roles.airnodeAdmin)
          .setAdminStatus(airnodeId, roles.admin.address, AdminStatus.Unauthorized)
      )
        .to.emit(selfAuthorizer, 'SetAdminStatus')
        .withArgs(airnodeId, roles.admin.address, AdminStatus.Unauthorized);
      expect(await selfAuthorizer.airnodeIdToAdminStatuses(airnodeId, roles.admin.address)).to.equal(
        AdminStatus.Unauthorized
      );
    });
    it('sets super admin status', async function () {
      // Give super admin status
      await expect(
        selfAuthorizer
          .connect(roles.airnodeAdmin)
          .setAdminStatus(airnodeId, roles.superAdmin.address, AdminStatus.SuperAdmin)
      )
        .to.emit(selfAuthorizer, 'SetAdminStatus')
        .withArgs(airnodeId, roles.superAdmin.address, AdminStatus.SuperAdmin);
      expect(await selfAuthorizer.airnodeIdToAdminStatuses(airnodeId, roles.superAdmin.address)).to.equal(
        AdminStatus.SuperAdmin
      );
      // Revoke super admin status
      await expect(
        selfAuthorizer
          .connect(roles.airnodeAdmin)
          .setAdminStatus(airnodeId, roles.superAdmin.address, AdminStatus.Unauthorized)
      )
        .to.emit(selfAuthorizer, 'SetAdminStatus')
        .withArgs(airnodeId, roles.superAdmin.address, AdminStatus.Unauthorized);
      expect(await selfAuthorizer.airnodeIdToAdminStatuses(airnodeId, roles.superAdmin.address)).to.equal(
        AdminStatus.Unauthorized
      );
    });
  });
  describe('Caller is not the Airnode admin', async function () {
    it('reverts', async function () {
      await expect(
        selfAuthorizer.connect(roles.randomPerson).setAdminStatus(airnodeId, roles.admin.address, AdminStatus.Admin)
      ).to.be.revertedWith('Unauthorized');
      await expect(
        selfAuthorizer
          .connect(roles.randomPerson)
          .setAdminStatus(airnodeId, roles.admin.address, AdminStatus.SuperAdmin)
      ).to.be.revertedWith('Unauthorized');
    });
  });
});

describe('renounceAdminStatus', function () {
  describe('Caller is an admin', async function () {
    it('renounces admin status', async function () {
      await selfAuthorizer
        .connect(roles.airnodeAdmin)
        .setAdminStatus(airnodeId, roles.admin.address, AdminStatus.Admin);
      await expect(selfAuthorizer.connect(roles.admin).renounceAdminStatus(airnodeId))
        .to.emit(selfAuthorizer, 'RenouncedAdminStatus')
        .withArgs(airnodeId, roles.admin.address);
      expect(await selfAuthorizer.airnodeIdToAdminStatuses(airnodeId, roles.admin.address)).to.equal(
        AdminStatus.Unauthorized
      );
    });
  });
  describe('Caller is a super admin', async function () {
    it('renounces admin status', async function () {
      await selfAuthorizer
        .connect(roles.airnodeAdmin)
        .setAdminStatus(airnodeId, roles.superAdmin.address, AdminStatus.SuperAdmin);
      await expect(selfAuthorizer.connect(roles.superAdmin).renounceAdminStatus(airnodeId))
        .to.emit(selfAuthorizer, 'RenouncedAdminStatus')
        .withArgs(airnodeId, roles.superAdmin.address);
      expect(await selfAuthorizer.airnodeIdToAdminStatuses(airnodeId, roles.superAdmin.address)).to.equal(
        AdminStatus.Unauthorized
      );
    });
  });
  describe('Caller is not an admin', async function () {
    it('reverts', async function () {
      await expect(selfAuthorizer.connect(roles.randomPerson).renounceAdminStatus(airnodeId)).to.be.revertedWith(
        'Unauthorized'
      );
    });
  });
});

describe('extendWhitelistExpiration', function () {
  describe('Caller is an admin', function () {
    describe('Provided expiration extends', function () {
      it('extends whitelist expiration', async function () {
        await selfAuthorizer
          .connect(roles.airnodeAdmin)
          .setAdminStatus(airnodeId, roles.admin.address, AdminStatus.Admin);
        const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
        const expiration = now + 100;
        await expect(
          selfAuthorizer.connect(roles.admin).extendWhitelistExpiration(airnodeId, roles.client.address, expiration)
        )
          .to.emit(selfAuthorizer, 'ExtendedWhitelistExpiration')
          .withArgs(airnodeId, roles.client.address, expiration, roles.admin.address);
        expect(
          await selfAuthorizer.airnodeIdToClientAddressToWhitelistExpiration(airnodeId, roles.client.address)
        ).to.equal(expiration);
      });
    });
    describe('Provided expiration does not extend', function () {
      it('reverts', async function () {
        await selfAuthorizer
          .connect(roles.airnodeAdmin)
          .setAdminStatus(airnodeId, roles.admin.address, AdminStatus.Admin);
        const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
        await selfAuthorizer.connect(roles.admin).extendWhitelistExpiration(airnodeId, roles.client.address, now);
        const expiration = now - 100;
        await expect(
          selfAuthorizer.connect(roles.admin).extendWhitelistExpiration(airnodeId, roles.client.address, expiration)
        ).to.be.revertedWith('Expiration not extended');
      });
    });
  });
  describe('Caller is a super admin', async function () {
    describe('Provided expiration extends', function () {
      it('extends whitelist expiration', async function () {
        await selfAuthorizer
          .connect(roles.airnodeAdmin)
          .setAdminStatus(airnodeId, roles.superAdmin.address, AdminStatus.SuperAdmin);
        const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
        const expiration = now + 100;
        await expect(
          selfAuthorizer
            .connect(roles.superAdmin)
            .extendWhitelistExpiration(airnodeId, roles.client.address, expiration)
        )
          .to.emit(selfAuthorizer, 'ExtendedWhitelistExpiration')
          .withArgs(airnodeId, roles.client.address, expiration, roles.superAdmin.address);
        expect(
          await selfAuthorizer.airnodeIdToClientAddressToWhitelistExpiration(airnodeId, roles.client.address)
        ).to.equal(expiration);
      });
    });
    describe('Provided expiration does not extend', function () {
      it('reverts', async function () {
        await selfAuthorizer
          .connect(roles.airnodeAdmin)
          .setAdminStatus(airnodeId, roles.superAdmin.address, AdminStatus.SuperAdmin);
        const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
        await selfAuthorizer.connect(roles.superAdmin).extendWhitelistExpiration(airnodeId, roles.client.address, now);
        const expiration = now - 100;
        await expect(
          selfAuthorizer
            .connect(roles.superAdmin)
            .extendWhitelistExpiration(airnodeId, roles.client.address, expiration)
        ).to.be.revertedWith('Expiration not extended');
      });
    });
  });
  describe('Caller is the Airnode admin', function () {
    describe('Provided expiration extends', function () {
      it('extends whitelist expiration', async function () {
        const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
        const expiration = now + 100;
        await expect(
          selfAuthorizer
            .connect(roles.airnodeAdmin)
            .extendWhitelistExpiration(airnodeId, roles.client.address, expiration)
        )
          .to.emit(selfAuthorizer, 'ExtendedWhitelistExpiration')
          .withArgs(airnodeId, roles.client.address, expiration, roles.airnodeAdmin.address);
        expect(
          await selfAuthorizer.airnodeIdToClientAddressToWhitelistExpiration(airnodeId, roles.client.address)
        ).to.equal(expiration);
      });
    });
    describe('Provided expiration does not extend', function () {
      it('reverts', async function () {
        const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
        await selfAuthorizer
          .connect(roles.airnodeAdmin)
          .extendWhitelistExpiration(airnodeId, roles.client.address, now);
        const expiration = now - 100;
        await expect(
          selfAuthorizer
            .connect(roles.airnodeAdmin)
            .extendWhitelistExpiration(airnodeId, roles.client.address, expiration)
        ).to.be.revertedWith('Expiration not extended');
      });
    });
  });
  describe('Caller is not an admin', function () {
    it('reverts', async function () {
      const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
      await expect(
        selfAuthorizer.connect(roles.randomPerson).extendWhitelistExpiration(airnodeId, roles.client.address, now)
      ).to.be.revertedWith('Unauthorized');
    });
  });
});

describe('setWhitelistExpiration', function () {
  describe('Caller is a super admin', async function () {
    it('sets whitelist expiration', async function () {
      await selfAuthorizer
        .connect(roles.airnodeAdmin)
        .setAdminStatus(airnodeId, roles.superAdmin.address, AdminStatus.SuperAdmin);
      const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
      const expiration = now + 100;
      await expect(
        selfAuthorizer.connect(roles.superAdmin).setWhitelistExpiration(airnodeId, roles.client.address, expiration)
      )
        .to.emit(selfAuthorizer, 'SetWhitelistExpiration')
        .withArgs(airnodeId, roles.client.address, expiration, roles.superAdmin.address);
      expect(
        await selfAuthorizer.airnodeIdToClientAddressToWhitelistExpiration(airnodeId, roles.client.address)
      ).to.equal(expiration);
      await expect(
        selfAuthorizer.connect(roles.superAdmin).setWhitelistExpiration(airnodeId, roles.client.address, now)
      )
        .to.emit(selfAuthorizer, 'SetWhitelistExpiration')
        .withArgs(airnodeId, roles.client.address, now, roles.superAdmin.address);
      expect(
        await selfAuthorizer.airnodeIdToClientAddressToWhitelistExpiration(airnodeId, roles.client.address)
      ).to.equal(now);
    });
  });
  describe('Caller is the Airnode admin', async function () {
    it('sets whitelist expiration', async function () {
      const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
      const expiration = now + 100;
      await expect(
        selfAuthorizer.connect(roles.airnodeAdmin).setWhitelistExpiration(airnodeId, roles.client.address, expiration)
      )
        .to.emit(selfAuthorizer, 'SetWhitelistExpiration')
        .withArgs(airnodeId, roles.client.address, expiration, roles.airnodeAdmin.address);
      expect(
        await selfAuthorizer.airnodeIdToClientAddressToWhitelistExpiration(airnodeId, roles.client.address)
      ).to.equal(expiration);
      await expect(
        selfAuthorizer.connect(roles.airnodeAdmin).setWhitelistExpiration(airnodeId, roles.client.address, now)
      )
        .to.emit(selfAuthorizer, 'SetWhitelistExpiration')
        .withArgs(airnodeId, roles.client.address, now, roles.airnodeAdmin.address);
      expect(
        await selfAuthorizer.airnodeIdToClientAddressToWhitelistExpiration(airnodeId, roles.client.address)
      ).to.equal(now);
    });
  });
  describe('Caller is an admin', function () {
    it('reverts', async function () {
      await selfAuthorizer
        .connect(roles.airnodeAdmin)
        .setAdminStatus(airnodeId, roles.admin.address, AdminStatus.Admin);
      const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
      await expect(
        selfAuthorizer.connect(roles.admin).setWhitelistExpiration(airnodeId, roles.client.address, now)
      ).to.be.revertedWith('Unauthorized');
    });
  });
  describe('Caller is not an admin', function () {
    it('reverts', async function () {
      const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
      await expect(
        selfAuthorizer.connect(roles.randomPerson).setWhitelistExpiration(airnodeId, roles.client.address, now)
      ).to.be.revertedWith('Unauthorized');
    });
  });
});

describe('setBlacklistStatus', function () {
  describe('Caller is a super admin', async function () {
    it('sets blacklist status', async function () {
      await selfAuthorizer
        .connect(roles.airnodeAdmin)
        .setAdminStatus(airnodeId, roles.superAdmin.address, AdminStatus.SuperAdmin);
      await expect(selfAuthorizer.connect(roles.superAdmin).setBlacklistStatus(airnodeId, roles.client.address, true))
        .to.emit(selfAuthorizer, 'SetBlacklistStatus')
        .withArgs(airnodeId, roles.client.address, true, roles.superAdmin.address);
      expect(await selfAuthorizer.airnodeIdToClientAddressToBlacklistStatus(airnodeId, roles.client.address)).to.equal(
        true
      );
      await expect(selfAuthorizer.connect(roles.superAdmin).setBlacklistStatus(airnodeId, roles.client.address, false))
        .to.emit(selfAuthorizer, 'SetBlacklistStatus')
        .withArgs(airnodeId, roles.client.address, false, roles.superAdmin.address);
      expect(await selfAuthorizer.airnodeIdToClientAddressToBlacklistStatus(airnodeId, roles.client.address)).to.equal(
        false
      );
    });
  });
  describe('Caller is the Airnode admin', async function () {
    it('sets whitelist expiration', async function () {
      await expect(selfAuthorizer.connect(roles.airnodeAdmin).setBlacklistStatus(airnodeId, roles.client.address, true))
        .to.emit(selfAuthorizer, 'SetBlacklistStatus')
        .withArgs(airnodeId, roles.client.address, true, roles.airnodeAdmin.address);
      expect(await selfAuthorizer.airnodeIdToClientAddressToBlacklistStatus(airnodeId, roles.client.address)).to.equal(
        true
      );
      await expect(
        selfAuthorizer.connect(roles.airnodeAdmin).setBlacklistStatus(airnodeId, roles.client.address, false)
      )
        .to.emit(selfAuthorizer, 'SetBlacklistStatus')
        .withArgs(airnodeId, roles.client.address, false, roles.airnodeAdmin.address);
      expect(await selfAuthorizer.airnodeIdToClientAddressToBlacklistStatus(airnodeId, roles.client.address)).to.equal(
        false
      );
    });
  });
  describe('Caller is an admin', function () {
    it('reverts', async function () {
      await selfAuthorizer
        .connect(roles.airnodeAdmin)
        .setAdminStatus(airnodeId, roles.admin.address, AdminStatus.Admin);
      await expect(
        selfAuthorizer.connect(roles.admin).setBlacklistStatus(airnodeId, roles.client.address, true)
      ).to.be.revertedWith('Unauthorized');
    });
  });
  describe('Caller is not an admin', function () {
    it('reverts', async function () {
      await expect(
        selfAuthorizer.connect(roles.randomPerson).setBlacklistStatus(airnodeId, roles.client.address, true)
      ).to.be.revertedWith('Unauthorized');
    });
  });
});

describe('isAuthorized', function () {
  describe('Designated wallet balance is not zero', function () {
    describe('Client is not blacklisted', function () {
      describe('Client whitelisting has not expired', function () {
        it('returns true', async function () {
          const designatedWallet = ethers.Wallet.createRandom();
          await roles.client.sendTransaction({
            to: designatedWallet.address,
            value: 1,
          });
          const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
          const expiration = now + 100;
          selfAuthorizer
            .connect(roles.airnodeAdmin)
            .setWhitelistExpiration(airnodeId, roles.client.address, expiration);
          expect(
            await selfAuthorizer.isAuthorized(
              requestId,
              airnodeId,
              endpointId,
              requesterIndex,
              designatedWallet.address,
              roles.client.address
            )
          ).to.equal(true);
        });
      });
      describe('Client whitelisting has expired', function () {
        it('returns false', async function () {
          const designatedWallet = ethers.Wallet.createRandom();
          await roles.client.sendTransaction({
            to: designatedWallet.address,
            value: 1,
          });
          expect(
            await selfAuthorizer.isAuthorized(
              requestId,
              airnodeId,
              endpointId,
              requesterIndex,
              designatedWallet.address,
              roles.client.address
            )
          ).to.equal(false);
        });
      });
    });
    describe('Client is blacklisted', function () {
      it('returns false', async function () {
        const designatedWallet = ethers.Wallet.createRandom();
        await roles.client.sendTransaction({
          to: designatedWallet.address,
          value: 1,
        });
        const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
        const expiration = now + 100;
        selfAuthorizer.connect(roles.airnodeAdmin).setWhitelistExpiration(airnodeId, roles.client.address, expiration);
        selfAuthorizer.connect(roles.airnodeAdmin).setBlacklistStatus(airnodeId, roles.client.address, true);
        expect(
          await selfAuthorizer.isAuthorized(
            requestId,
            airnodeId,
            endpointId,
            requesterIndex,
            designatedWallet.address,
            roles.client.address
          )
        ).to.equal(false);
      });
    });
  });
  describe('Designated wallet balance is zero', function () {
    it('returns false', async function () {
      const designatedWallet = ethers.Wallet.createRandom();
      const now = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
      const expiration = now + 100;
      selfAuthorizer.connect(roles.airnodeAdmin).setWhitelistExpiration(airnodeId, roles.client.address, expiration);
      expect(
        await selfAuthorizer.isAuthorized(
          requestId,
          airnodeId,
          endpointId,
          requesterIndex,
          designatedWallet.address,
          roles.client.address
        )
      ).to.equal(false);
    });
  });
});
