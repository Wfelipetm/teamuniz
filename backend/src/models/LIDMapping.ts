import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  Index
} from "sequelize-typescript";
import Company from "./Company";
import Contact from "./Contact";

@Table
class LIDMapping extends Model<LIDMapping> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Index("lid_company_idx")
  @Column({
    type: DataType.STRING,
    allowNull: false,
    comment: "Local Identifier (LID) - formato: 123456789@lid ou 123456789:0@lid"
  })
  lid: string;

  @Index("phone_company_idx")
  @Column({
    type: DataType.STRING,
    allowNull: false,
    comment: "Phone Number (PN) - formato: 5521999998888@s.whatsapp.net"
  })
  phoneNumber: string;

  @ForeignKey(() => Company)
  @Index("lid_company_idx")
  @Index("phone_company_idx")
  @Column({
    allowNull: false
  })
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => Contact)
  @Column({
    allowNull: true
  })
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
    comment: "Última vez que este mapeamento foi visto/utilizado"
  })
  lastSeen: Date;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    defaultValue: "message",
    comment: "Origem do mapeamento: message, usync, manual, etc"
  })
  source: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: "Metadados adicionais: device info, addressing mode, etc"
  })
  metadata: object;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default LIDMapping;
