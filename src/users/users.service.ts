import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Account } from '../accounts/entities/account.entity';
import { CentralBankService } from '../central-bank/central-bank.service'; // <-- Importa el servicio nuevo
import { CreatePersonDto } from '../central-bank/dto/create-person.dto'; // <-- Importa el DTO

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly centralBankService: CentralBankService, // <-- Inyectamos el servicio del Banco Central
  ) {}

  // Método para sincronizar con el Banco Central y obtener el CBU
  async syncWithCentralBank(userId: string, data: CreatePersonDto) {
    // 1. Buscamos al usuario y su cuenta local
    const user = await this.userRepository.findOne({ 
      where: { id: userId }, 
      relations: ['account'] 
    });

    if (!user || !user.account) {
      throw new NotFoundException('Usuario o cuenta no encontrada para sincronizar');
    }

    // 2. Llamamos a la API del Banco Central (Backend a Backend)
    // Esto nos devuelve el CBU de 22 dígitos
    const centralBankData = await this.centralBankService.registerPerson(data);

    // 3. Actualizamos el accountNumber (CBU) en la tabla de cuentas
    user.account.accountNumber = centralBankData.cbu;
    
    // Opcional: También podrías actualizar el nombre del usuario con el que devolvió la API
    user.fullName = `${centralBankData.nombre} ${centralBankData.apellido}`;

    await this.accountRepository.save(user.account);
    await this.userRepository.save(user);

    return {
      message: 'CBU sincronizado exitosamente',
      cbu: centralBankData.cbu,
      account: user.account
    };
  }

  // --- Tus métodos anteriores se mantienen igual ---

  async findOne(id: string): Promise<User | null> {
    return this.userRepository.findOne({ 
      where: { id },
      relations: ['account']
    });
  }

  async createFromClerk(clerkId: string, email: string, fullName: string) {
    const user = this.userRepository.create({
      id: clerkId,
      email,
      fullName,
    });
    
    const savedUser = await this.userRepository.save(user);

    const account = this.accountRepository.create({
      // Generamos uno temporal hasta que el usuario se sincronice
      accountNumber: 'PENDING-' + Math.floor(1000 + Math.random() * 9000).toString(),
      balance: 150000, // ¡Tus 150k de regalo!
      user: savedUser,
    });
    
    await this.accountRepository.save(account);
    
    return {
      message: 'Usuario y cuenta creados con éxito',
      user: savedUser,
      account: account
    };
  }


  async findOneByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email }, relations: ['account'] });
  }

  // Mantenemos este por si necesitas buscar por ID de base de datos interno
  async findById(id: string) {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['account'] });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async updateProfile(id: string, updateData: { fullName?: string }) {
    // Buscamos al usuario por el ID de Clerk que recibimos
    const user = await this.userRepository.findOneBy({ id });
    
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Actualizamos los datos (Clerk maneja el email y pass, nosotros el nombre)
    if (updateData.fullName) {
      user.fullName = updateData.fullName;
    }

    return await this.userRepository.save(user);
  }

async getCombinedHistory(clerkId: string) {
  // 1. Buscamos la cuenta local para saber nuestro CBU
  const user = await this.findOne(clerkId);
  if (!user || !user.account) return [];

  const myCbu = user.account.accountNumber;

  try {
    // 2. Traemos las transacciones de la Red Central (usando el servicio que ya tenés)
    const allCentralTxs = await this.centralBankService.getTransactions();

    // 3. Filtramos las que son nuestras (donde somos origen o destino)
    const myTxs = allCentralTxs.filter(
      (tx: any) => tx.cbuOrigen === myCbu || tx.cbuDestino === myCbu
    );

    // 4. Formateamos para el Frontend
    return myTxs.map((tx: any) => ({
      id: tx.id,
      amount: tx.cbuDestino === myCbu ? Number(tx.importe) : -Number(tx.importe),
      description: tx.cbuDestino === myCbu 
        ? `Recibido de: ${tx.cbuOrigen}` 
        : `Enviado a: ${tx.cbuDestino}`,
      createdAt: tx.createdAt,
    }));
  } catch (error) {
    console.error("Error al traer historial de la red:", error);
    return []; // Si falla la red, devolvemos lista vacía para que no explote el front
  }
}
}